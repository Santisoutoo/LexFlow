import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ModelWizard, ModelWizardGate } from './ModelWizard';
import { ConfirmProvider } from '@/components/ui';
import { api } from '@/lib/api';
import { liveSecretsApi } from '@/lib/api/secrets';
import { qk } from '@/lib/queries';
import type { Model, SystemProfile } from '@/lib/types';
import { useUi } from '@/lib/store';
import { WIZARD_PULL_STORAGE_KEY } from './onboarding-storage';

const profileFixture: SystemProfile = {
  totalRamGb: 16,
  availableRamGb: 10,
  cpuCores: 8,
  hasNvidiaGpu: false,
  vramGb: null,
  gpuName: null,
  isAppleSilicon: false,
  platform: 'linux',
  ollamaRunning: true,
  ollamaModels: [],
  lmstudioRunning: false,
};

const useSystemProfileMock = vi.fn();
const useModelsMock = vi.fn();
const invalidateModelsMock = vi.fn();

vi.mock('@/lib/queries', () => ({
  qk: {
    models: () => ['models'],
  },
  useSystemProfile: () => useSystemProfileMock(),
  useModels: () => useModelsMock(),
  useInvalidateModels: () => invalidateModelsMock,
}));

vi.mock('@/lib/api/secrets', () => ({
  liveSecretsApi: {
    list: vi.fn(),
    set: vi.fn(),
    test: vi.fn(),
    remove: vi.fn(),
  },
}));

function renderWizard(onComplete = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ConfirmProvider>
            <ModelWizard onComplete={onComplete} onSkip={vi.fn()} onLater={vi.fn()} />
          </ConfirmProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

async function goToStep4Confirm() {
  await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
  await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
  await userEvent.click(screen.getByRole('button', { name: /free local — small/i }));
  await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
}

describe('ModelWizard finish gate', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    invalidateModelsMock.mockReset();
    useSystemProfileMock.mockReturnValue({
      data: profileFixture,
      isLoading: false,
      refetch: vi.fn().mockResolvedValue({ data: profileFixture }),
    });
    useModelsMock.mockReturnValue({
      data: [{ id: 'ollama:llama3.2:3b', available: true, label: 'llama3.2:3b', vendor: 'ollama', kind: 'local' }],
    });
    useUi.setState({ defaultModel: '' });
    vi.spyOn(api.models, 'list').mockResolvedValue([
      { id: 'ollama:llama3.2:3b', available: true, label: 'llama3.2:3b', vendor: 'ollama', kind: 'local' },
    ]);
    vi.mocked(liveSecretsApi.list).mockReset().mockResolvedValue([
      { provider: 'anthropic', configured: false },
      { provider: 'openai', configured: false },
      { provider: 'google', configured: false },
    ]);
    vi.mocked(liveSecretsApi.set).mockReset().mockResolvedValue(undefined);
    vi.mocked(liveSecretsApi.test).mockReset().mockResolvedValue({ valid: false });
  });

  it('disables finish on step 3 before local install completes', async () => {
    renderWizard();
    await goToStep4Confirm();

    expect(screen.getByRole('button', { name: /usar free local/i })).toBeDisabled();
    expect(screen.getByText(/instala el modelo primero/i)).toBeInTheDocument();
  });

  it('enables finish after pull reaches done', async () => {
    vi.spyOn(api.models, 'pull').mockImplementation(async function* () {
      yield { type: 'done', model: 'llama3.2:3b' };
    });

    renderWizard();
    await goToStep4Confirm();
    await userEvent.click(screen.getByRole('button', { name: /instalar/i }));

    expect(screen.getByRole('button', { name: /usar free local/i })).toBeEnabled();
  });

  it('sets defaultModel with provider:model id on verified finish', async () => {
    vi.spyOn(api.models, 'pull').mockImplementation(async function* () {
      yield { type: 'done', model: 'llama3.2:3b' };
    });
    const onComplete = vi.fn();
    const freshModels: Model[] = [
      { id: 'ollama:llama3.2:3b', available: true, label: 'llama3.2:3b', vendor: 'ollama', kind: 'local' },
    ];
    vi.spyOn(api.models, 'list').mockResolvedValue(freshModels);

    const { queryClient } = renderWizard(onComplete);
    await goToStep4Confirm();
    await userEvent.click(screen.getByRole('button', { name: /instalar/i }));
    await userEvent.click(screen.getByRole('button', { name: /usar free local/i }));

    expect(useUi.getState().defaultModel).toBe('ollama:llama3.2:3b');
    expect(queryClient.getQueryData(qk.models())).toEqual(freshModels);
    expect(invalidateModelsMock).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /empezar a usar lexflow/i }));
    expect(onComplete).toHaveBeenCalledWith('small');
  });
});

async function goToStep4Cloud() {
  await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
  await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
  await userEvent.click(screen.getByRole('button', { name: /best cloud — pay-per-use/i }));
  await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
}

describe('ModelWizard cloud key gate', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    invalidateModelsMock.mockReset();
    useSystemProfileMock.mockReturnValue({
      data: profileFixture,
      isLoading: false,
      refetch: vi.fn().mockResolvedValue({ data: profileFixture }),
    });
    useModelsMock.mockReturnValue({
      data: [{ id: 'anthropic:claude-sonnet-4-6', available: true, label: 'claude-sonnet-4-6', vendor: 'anthropic', kind: 'cloud' }],
    });
    useUi.setState({ defaultModel: '' });
    vi.mocked(liveSecretsApi.list).mockReset().mockResolvedValue([
      { provider: 'anthropic', configured: false },
      { provider: 'openai', configured: false },
      { provider: 'google', configured: false },
    ]);
    vi.mocked(liveSecretsApi.set).mockReset().mockResolvedValue(undefined);
    vi.mocked(liveSecretsApi.test).mockReset();
  });

  it('disables Usar until the key probe returns valid', async () => {
    vi.mocked(liveSecretsApi.test).mockResolvedValue({ valid: false, code: 'invalid_api_key' });
    renderWizard();
    await goToStep4Cloud();

    expect(screen.getByRole('button', { name: /usar best cloud/i })).toBeDisabled();
    expect(screen.getByText(/pega y valida tu clave api/i)).toBeInTheDocument();
  });

  it('enables Usar after mock test succeeds', async () => {
    vi.mocked(liveSecretsApi.test).mockResolvedValue({ valid: true });
    renderWizard();
    await goToStep4Cloud();

    await userEvent.type(screen.getByPlaceholderText(/pega tu api key/i), 'sk-good');
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => {
      expect(liveSecretsApi.set).toHaveBeenCalledWith('anthropic', 'sk-good');
      expect(liveSecretsApi.test).toHaveBeenCalledWith('anthropic');
      expect(screen.getByRole('button', { name: /usar best cloud/i })).toBeEnabled();
    });
  });
});

describe('ModelWizard Ollama install guide', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    invalidateModelsMock.mockReset();
    useModelsMock.mockReturnValue({
      data: [{ id: 'ollama:llama3.2:3b', available: true, label: 'llama3.2:3b', vendor: 'ollama', kind: 'local' }],
    });
    useUi.setState({ defaultModel: '' });
    vi.mocked(liveSecretsApi.list).mockResolvedValue([]);
  });

  it('shows download guide when ollama is not running', async () => {
    const refetch = vi.fn().mockResolvedValue({
      data: { ...profileFixture, ollamaRunning: false },
    });
    useSystemProfileMock.mockReturnValue({
      data: { ...profileFixture, ollamaRunning: false },
      isLoading: false,
      refetch,
    });
    renderWizard();
    await goToStep4Confirm();

    expect(screen.getByText(/instalar ollama/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^instalar$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /usar free local/i })).toBeDisabled();
  });

  it('enables Instalar after refetch reports ollamaRunning', async () => {
    const refetch = vi.fn().mockResolvedValue({
      data: { ...profileFixture, ollamaRunning: true },
    });
    useSystemProfileMock.mockReturnValue({
      data: { ...profileFixture, ollamaRunning: false },
      isLoading: false,
      refetch,
    });
    renderWizard();
    await goToStep4Confirm();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^instalar$/i })).toBeEnabled();
    });
    expect(screen.getByText(/ollama detectado/i)).toBeInTheDocument();
  });

  it('enables Instalar after a later refetch reports ollamaRunning', async () => {
    const refetch = vi
      .fn()
      .mockResolvedValueOnce({ data: { ...profileFixture, ollamaRunning: false } })
      .mockResolvedValue({ data: { ...profileFixture, ollamaRunning: true } });
    useSystemProfileMock.mockReturnValue({
      data: { ...profileFixture, ollamaRunning: false },
      isLoading: false,
      refetch,
    });
    renderWizard();
    await goToStep4Confirm();

    expect(screen.getByText(/instalar ollama/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /re-detectar/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^instalar$/i })).toBeEnabled();
    });
    expect(refetch.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('ModelWizard pull persistence', () => {
  beforeEach(() => {
    sessionStorage.clear();
    invalidateModelsMock.mockReset();
    useModelsMock.mockReturnValue({
      data: [{ id: 'ollama:llama3.2:3b', available: true, label: 'llama3.2:3b', vendor: 'ollama', kind: 'local' }],
    });
    useUi.setState({ defaultModel: '' });
    useSystemProfileMock.mockReturnValue({
      data: profileFixture,
      isLoading: false,
      refetch: vi.fn().mockResolvedValue({ data: profileFixture }),
    });
    vi.mocked(liveSecretsApi.list).mockResolvedValue([]);
  });

  it('restores pulling UI after unmount when session storage says pull in progress', async () => {
    sessionStorage.setItem(
      WIZARD_PULL_STORAGE_KEY,
      JSON.stringify({
        tierKey: 'small',
        model: 'llama3.2:3b',
        phase: 'pulling',
        startedAt: new Date().toISOString(),
        lastStatus: 'descargando capas',
      }),
    );

    const view = renderWizard();
    await goToStep4Confirm();

    expect(screen.getByText(/descargando capas/i)).toBeInTheDocument();
    view.unmount();

    renderWizard();
    await goToStep4Confirm();
    expect(screen.getByText(/instalando/i)).toBeInTheDocument();
  });
});

describe('ModelWizardGate tour trigger', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    useUi.setState({ tourRequested: false });
    useSystemProfileMock.mockReturnValue({
      data: profileFixture,
      isLoading: false,
      refetch: vi.fn().mockResolvedValue({ data: profileFixture }),
    });
    useModelsMock.mockReturnValue({
      data: [{ id: 'ollama:llama3.2:3b', available: true, label: 'llama3.2:3b', vendor: 'ollama', kind: 'local' }],
    });
    vi.spyOn(api.models, 'pull').mockImplementation(async function* () {
      yield { type: 'done', model: 'llama3.2:3b' };
    });
    vi.spyOn(api.models, 'list').mockResolvedValue([
      { id: 'ollama:llama3.2:3b', available: true, label: 'llama3.2:3b', vendor: 'ollama', kind: 'local' },
    ]);
  });

  it('requests tour after wizard completion when tutorial is not done', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ConfirmProvider>
            <ModelWizardGate>
              <div>app</div>
            </ModelWizardGate>
          </ConfirmProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
    await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
    await userEvent.click(screen.getByRole('button', { name: /free local — small/i }));
    await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
    await userEvent.click(screen.getByRole('button', { name: /instalar/i }));
    await userEvent.click(screen.getByRole('button', { name: /usar free local/i }));
    await userEvent.click(screen.getByRole('button', { name: /empezar a usar lexflow/i }));

    expect(useUi.getState().tourRequested).toBe(true);
  });
});
