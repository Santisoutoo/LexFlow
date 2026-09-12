import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { SetDefaultProviderButton } from './SettingsPage';
import { useUi } from '@/lib/store';
import { useToast } from '@/lib/toast';

describe('SetDefaultProviderButton', () => {
  beforeEach(() => {
    useUi.setState({ defaultModel: 'ollama:qwen' });
    useToast.setState({ toasts: [] });
  });

  it('shows the default badge and disables the action on the current default', () => {
    render(
      <SetDefaultProviderButton providerId="ollama:qwen" providerLabel="Ollama" isDefault />,
    );
    expect(screen.getByText('Predeterminado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /usar ollama por defecto/i })).toBeDisabled();
  });

  it('sets the default, exposes an aria-label, and toasts on success', async () => {
    render(
      <SetDefaultProviderButton providerId="openai:gpt" providerLabel="OpenAI" isDefault={false} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /usar openai por defecto/i }));
    expect(useUi.getState().defaultModel).toBe('openai:gpt');
    expect(useToast.getState().toasts[0]?.tone).toBe('success');
  });
});
