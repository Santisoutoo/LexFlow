import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ModelWizard } from './ModelWizard';
import { api } from '@/lib/api';
import { qk } from '@/lib/queries';
import type { Model, SystemProfile } from '@/lib/types';
import { useUi } from '@/lib/store';

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
  },
}));

function renderWizard(onComplete = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ModelWizard onComplete={onComplete} onSkip={vi.fn()} onLater={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

async function goToStep3Small() {
  await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
  await userEvent.click(screen.getByRole('button', { name: /free local — small/i }));
  await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
}

describe('ModelWizard finish gate', () => {
  beforeEach(() => {
    invalidateModelsMock.mockReset();
    useSystemProfileMock.mockReturnValue({
      data: profileFixture,
      isLoading: false,
      refetch: vi.fn(),
    });
    useModelsMock.mockReturnValue({
      data: [{ id: 'ollama:llama3.2:3b', available: true, label: 'llama3.2:3b', vendor: 'ollama', kind: 'local' }],
    });
    useUi.setState({ defaultModel: '' });
    vi.spyOn(api.models, 'list').mockResolvedValue([
      { id: 'ollama:llama3.2:3b', available: true, label: 'llama3.2:3b', vendor: 'ollama', kind: 'local' },
    ]);
  });

  it('disables finish on step 3 before local install completes', async () => {
    renderWizard();
    await goToStep3Small();

    expect(screen.getByRole('button', { name: /usar free local/i })).toBeDisabled();
    expect(screen.getByText(/instala el modelo primero/i)).toBeInTheDocument();
  });

  it('enables finish after pull reaches done', async () => {
    vi.spyOn(api.models, 'pull').mockImplementation(async function* () {
      yield { type: 'done', model: 'llama3.2:3b' };
    });

    renderWizard();
    await goToStep3Small();
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
    await goToStep3Small();
    await userEvent.click(screen.getByRole('button', { name: /instalar/i }));
    await userEvent.click(screen.getByRole('button', { name: /usar free local/i }));

    expect(useUi.getState().defaultModel).toBe('ollama:llama3.2:3b');
    expect(queryClient.getQueryData(qk.models())).toEqual(freshModels);
    expect(invalidateModelsMock).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledWith('small');
  });
});
