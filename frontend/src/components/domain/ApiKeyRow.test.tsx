import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiKeyRow } from './ApiKeyRow';
import { ConfirmProvider } from '@/components/ui';
import { liveSecretsApi } from '@/lib/api/secrets';

vi.mock('@/lib/api/secrets', () => ({
  liveSecretsApi: {
    list: vi.fn(),
    set: vi.fn(),
    test: vi.fn(),
    remove: vi.fn(),
  },
}));

function renderRow(
  onValidationChange = vi.fn(),
  row: { provider: 'anthropic'; configured: boolean; source?: 'env' | 'keyring' | null } = {
    provider: 'anthropic',
    configured: false,
  },
) {
  const onChange = vi.fn().mockResolvedValue(undefined);
  return {
    onChange,
    onValidationChange,
    ...render(
      <MemoryRouter>
        <ConfirmProvider>
          <ApiKeyRow row={row} onChange={onChange} onValidationChange={onValidationChange} />
        </ConfirmProvider>
      </MemoryRouter>,
    ),
  };
}

describe('ApiKeyRow', () => {
  beforeEach(() => {
    vi.mocked(liveSecretsApi.set).mockReset().mockResolvedValue(undefined);
    vi.mocked(liveSecretsApi.test).mockReset();
    vi.mocked(liveSecretsApi.remove).mockReset().mockResolvedValue(undefined);
  });

  it('save then test calls onValidationChange with valid', async () => {
    vi.mocked(liveSecretsApi.test).mockResolvedValue({ valid: true });
    const onValidationChange = vi.fn();
    renderRow(onValidationChange);

    await userEvent.type(screen.getByPlaceholderText(/pega tu api key/i), 'sk-good');
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => {
      expect(liveSecretsApi.set).toHaveBeenCalledWith('anthropic', 'sk-good');
      expect(liveSecretsApi.test).toHaveBeenCalledWith('anthropic');
      expect(onValidationChange).toHaveBeenCalledWith('valid');
    });
  });

  it('save then test calls onValidationChange with invalid', async () => {
    vi.mocked(liveSecretsApi.test).mockResolvedValue({
      valid: false,
      code: 'invalid_api_key',
      message: 'Invalid API key',
    });
    const onValidationChange = vi.fn();
    renderRow(onValidationChange);

    await userEvent.type(screen.getByPlaceholderText(/pega tu api key/i), 'sk-bad');
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => {
      expect(onValidationChange).toHaveBeenCalledWith('invalid', 'Invalid API key');
    });
  });

  it('disables overwrite when the key comes from the environment', () => {
    renderRow(vi.fn(), { provider: 'anthropic', configured: true, source: 'env' });
    expect(screen.getByPlaceholderText(/pega una nueva clave/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /guardar/i })).toBeDisabled();
  });
});
