import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Law, SearchHit, SearchResults } from '@/lib/types';
import { ExplorerPage } from './ExplorerPage';

const useLawsListInfiniteMock = vi.fn();
const useSearchInfiniteMock = vi.fn();
const useWarmupMock = vi.fn();

vi.mock('@/lib/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries')>();
  return {
    ...actual,
    useLawsListInfinite: (...args: unknown[]) => useLawsListInfiniteMock(...args),
    useSearchInfinite: (...args: unknown[]) => useSearchInfiniteMock(...args),
    useWarmup: (...args: unknown[]) => useWarmupMock(...args),
    useTags: () => ({ data: [{ tag: 'laboral', count: 3 }] }),
    useDepartments: () => ({ data: [] }),
    useUserTagVocab: () => ({ data: [] }),
    useUserTagLaws: () => ({ data: [] }),
  };
});

vi.mock('@/lib/store', () => ({
  useUi: (selector: (s: { density: string; setDensity: () => void }) => unknown) =>
    selector({ density: 'comfortable', setDensity: vi.fn() }),
}));

function makeLaw(id: string): Law {
  return {
    id,
    boe: id,
    title: `Law ${id}`,
    short: `Short ${id}`,
    status: 'vigente',
    rango: 'Ley',
    publicada: '2020-01-01',
    ambito: 'Estatal',
    articulos: 10,
    referencias: 0,
    versiones: 1,
    tags: [],
  };
}

function renderExplorer(initialEntry = '/explorer') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <ExplorerPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockBrowse(pages: Array<{ items: Law[]; total: number; cursor: string | null }>) {
  useLawsListInfiniteMock.mockReturnValue({
    data: { pages },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
    hasNextPage: pages.length > 0 && pages[pages.length - 1].cursor != null,
    isFetchingNextPage: false,
  });
}

function mockSearch(pages: SearchResults[], opts: { isError?: boolean } = {}) {
  useSearchInfiniteMock.mockReturnValue({
    data: opts.isError ? undefined : { pages },
    isLoading: false,
    isError: opts.isError ?? false,
    error: opts.isError ? new Error('network down') : null,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  });
}

describe('ExplorerPage pagination and states', () => {
  beforeEach(() => {
    useWarmupMock.mockReturnValue({ data: { searchReady: true } });
    mockSearch([]);
    useSearchInfiniteMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
  });

  it('shows Cargar más when browse list has another page', async () => {
    const page1 = Array.from({ length: 20 }, (_, i) => makeLaw(`LAW-${i + 1}`));
    mockBrowse([{ items: page1, total: 25, cursor: '2' }]);
    renderExplorer();

    expect(screen.getByRole('button', { name: /cargar más|load more/i })).toBeInTheDocument();
  });

  it('shows error state instead of empty when search fails', async () => {
    mockBrowse([{ items: [], total: 0, cursor: null }]);
    mockSearch([], { isError: true });
    renderExplorer('/explorer?q=fallo');

    expect(screen.getByText(/network down|servidor/i)).toBeInTheDocument();
    expect(screen.queryByText(/sin resultados/i)).not.toBeInTheDocument();
  });

  it('shows indexing hint during warmup in search mode', () => {
    mockBrowse([{ items: [], total: 0, cursor: null }]);
    useWarmupMock.mockReturnValue({ data: { searchReady: false } });
    mockSearch([{ hits: [], total: 0 }]);
    renderExplorer('/explorer?q=ley');

    expect(screen.getByText(/indexando/i)).toBeInTheDocument();
  });

  it('completes a tag suggestion with Enter', () => {
    mockBrowse([{ items: [], total: 0, cursor: null }]);
    renderExplorer('/explorer?q=%23lab');

    const input = screen.getByPlaceholderText(/buscar|search/i);
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(input).toHaveValue('#laboral ');
  });

  it('renders derogada badge on repealed search hit', () => {
    mockBrowse([{ items: [], total: 0, cursor: null }]);
    const hit: SearchHit = {
      kind: 'law',
      id: 'BOE-OLD',
      title: 'Ley derogada',
      status: 'derogada',
      rango: 'Ley',
      publicada: '1990-01-01',
      snippet: 'texto',
    };
    mockSearch([{ hits: [hit], total: 1, page: 1, pageSize: 20 }]);
    renderExplorer('/explorer?q=derog');

    const row = screen.getByText('Ley derogada').closest('[role="button"]');
    expect(row).toBeTruthy();
    expect(within(row as HTMLElement).getByText('Derogada')).toBeInTheDocument();
  });
});
