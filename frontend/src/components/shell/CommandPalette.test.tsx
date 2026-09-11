import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CommandPalette } from './CommandPalette';

const useSearchMock = vi.fn();

vi.mock('@/lib/queries', () => ({
  useSearch: (...args: unknown[]) => useSearchMock(...args),
  useTags: () => ({ data: [] }),
  useUserTagVocab: () => ({ data: [] }),
}));

vi.mock('@/lib/store', () => ({
  useUi: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      paletteOpen: true,
      setPaletteOpen: vi.fn(),
      toggleTheme: vi.fn(),
    }),
}));

function renderPalette() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CommandPalette />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CommandPalette search errors', () => {
  beforeEach(() => {
    useSearchMock.mockReturnValue({
      data: undefined,
      isFetching: false,
      isError: true,
      error: new Error('backend offline'),
      refetch: vi.fn(),
    });
  });

  it('shows retry on search failure instead of no-results', () => {
    renderPalette();
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'ley' } });

    expect(screen.getByText('backend offline')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reintentar|retry/i })).toBeInTheDocument();
    expect(screen.queryByText(/sin resultados/i)).not.toBeInTheDocument();
  });
});
