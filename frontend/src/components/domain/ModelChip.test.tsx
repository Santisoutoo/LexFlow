import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ModelChip } from './ModelChip';

vi.mock('@/lib/queries', () => ({
  useModels: () => ({
    data: [{ id: 'ollama:qwen', label: 'Qwen', vendor: 'Ollama', kind: 'local', available: true }],
  }),
}));

vi.mock('@/lib/store', () => ({
  useUi: (selector: (s: { defaultModel: string; setDefaultModel: (id: string) => void }) => unknown) =>
    selector({ defaultModel: 'ollama:qwen', setDefaultModel: vi.fn() }),
}));

describe('ModelChip', () => {
  it('renders the settings path as prose, not a keyboard glyph', async () => {
    render(<ModelChip />);
    await userEvent.click(screen.getByRole('button', { name: /qwen/i }));
    expect(screen.getByText(/cambia modelos en/i)).toBeInTheDocument();
    expect(screen.getByText('Ajustes › Modelos')).toBeInTheDocument();
    expect(screen.queryByText('Ajustes › Modelos')?.closest('kbd')).toBeNull();
  });
});
