import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { SearchHit, SearchResults } from '@/lib/types';
import { CommandPalette } from './CommandPalette';

const useSearchMock = vi.fn();
const navigateMock = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/lib/queries', () => ({
  useSearch: (...args: unknown[]) => useSearchMock(...args),
  useTags: () => ({ data: [] }),
  useUserTagVocab: () => ({ data: [] }),
  useWarmup: () => ({ data: { searchReady: true } }),
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

function makeHit(id: string, kind: 'law' | 'article'): SearchHit {
  return {
    kind,
    id,
    title: `${kind} ${id}`,
    status: 'vigente',
    rango: 'Ley',
    publicada: '2020-01-01',
    snippet: 'snippet',
  };
}

describe('CommandPalette search errors', () => {
  beforeEach(() => {
    navigateMock.mockReset();
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

describe('CommandPalette query parsing', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    useSearchMock.mockReturnValue({
      data: { hits: [], total: 0 } satisfies SearchResults,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('passes plain query and tag facets for inline #tag input', () => {
    renderPalette();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '#laboral despido' } });

    expect(useSearchMock).toHaveBeenCalledWith('despido', { tags: ['laboral'] });
  });
});

describe('CommandPalette keyboard order', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    useSearchMock.mockReturnValue({
      data: {
        hits: [makeHit('ART-1', 'article'), makeHit('LAW-1', 'law')],
        total: 2,
      } satisfies SearchResults,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('ArrowDown visits law before article when API returns article first', () => {
    renderPalette();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'civil' } });

    const viewAll = screen.getByText(/ver todos los resultados|view all results/i).closest('[role="option"]');
    const lawsHeader = screen.getByText(/leyes|laws/i);
    const articlesHeader = screen.getByText(/artículos|articles/i);
    const lawsSection = lawsHeader.parentElement as HTMLElement;
    const articlesSection = articlesHeader.parentElement as HTMLElement;

    const lawOption = within(lawsSection).getByRole('option');
    const articleOption = within(articlesSection).getByRole('option');

    expect(viewAll).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(lawOption).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(articleOption).toHaveAttribute('aria-selected', 'true');
  });
});

describe('CommandPalette view all results', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    useSearchMock.mockReturnValue({
      data: { hits: [makeHit('LAW-1', 'law')], total: 1 } satisfies SearchResults,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('navigates to search with the raw query', () => {
    renderPalette();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '#laboral despido' } });
    fireEvent.click(screen.getByText(/ver todos los resultados|view all results/i));

    expect(navigateMock).toHaveBeenCalledWith('/search?q=%23laboral+despido');
  });

  it('navigates to search on Enter when a query is typed', () => {
    renderPalette();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'despido' } });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(navigateMock).toHaveBeenCalledWith('/search?q=despido');
  });
});

describe('CommandPalette go-to commands', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    useSearchMock.mockReturnValue({
      data: { hits: [], total: 0 } satisfies SearchResults,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('surfaces the settings command for "ajustes" and navigates on run', () => {
    renderPalette();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ajustes' } });
    fireEvent.click(screen.getByText(/ir a ajustes|go to settings/i));
    expect(navigateMock).toHaveBeenCalledWith('/settings');
  });
});
