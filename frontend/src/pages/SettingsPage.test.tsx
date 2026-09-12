import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { SetDefaultProviderButton, SettingsPage } from './SettingsPage';
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

describe('SettingsPage section labels', () => {
  it('labels MCP as Conexiones avanzadas and lists it after Datos', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/:section" element={<SettingsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    const aside = document.querySelector('aside');
    expect(aside).not.toBeNull();
    const labels = [...aside!.querySelectorAll('button')].map((button) => button.textContent);
    const dataIdx = labels.indexOf('Datos');
    const mcpIdx = labels.indexOf('Conexiones avanzadas');
    expect(dataIdx).toBeGreaterThanOrEqual(0);
    expect(mcpIdx).toBeGreaterThan(dataIdx);
    expect(screen.queryByText('MCP Servers')).not.toBeInTheDocument();
  });
});
