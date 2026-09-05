import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ModelWizard } from './ModelWizard';
import { api } from '@/lib/api';
import type { SystemProfile } from '@/lib/types';
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

vi.mock('@/lib/queries', () => ({
  useSystemProfile: () => useSystemProfileMock(),
  useModels: () => useModelsMock(),
}));

vi.mock('@/lib/api/secrets', () => ({
  liveSecretsApi: {
    list: vi.fn(),
  },
}));

function renderWizard() {
  return render(
    <MemoryRouter>
      <ModelWizard onComplete={vi.fn()} onSkip={vi.fn()} onLater={vi.fn()} />
    </MemoryRouter>,
  );
}

async function goToStep3Small() {
  await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
  await userEvent.click(screen.getByRole('button', { name: /free local — small/i }));
  await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
}

describe('ModelWizard finish gate', () => {
  beforeEach(() => {
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

    render(
      <MemoryRouter>
        <ModelWizard onComplete={onComplete} onSkip={vi.fn()} onLater={vi.fn()} />
      </MemoryRouter>,
    );
    await goToStep3Small();
    await userEvent.click(screen.getByRole('button', { name: /instalar/i }));
    await userEvent.click(screen.getByRole('button', { name: /usar free local/i }));

    expect(useUi.getState().defaultModel).toBe('ollama:llama3.2:3b');
    expect(onComplete).toHaveBeenCalledWith('small');
  });
});
