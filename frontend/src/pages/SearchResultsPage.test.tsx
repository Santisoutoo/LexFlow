import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { HybridSearchResults, SearchResults, SemanticSearchResults, SemanticStatus } from '@/lib/types';
import { SearchResultsPage } from './SearchResultsPage';

const useSearchMock = vi.fn();
const useSemanticSearchMock = vi.fn();
const useHybridSearchMock = vi.fn();
const useSemanticStatusMock = vi.fn();

vi.mock('@/lib/queries', () => ({
  useSearch: (...args: unknown[]) => useSearchMock(...args),
  useSemanticSearch: (...args: unknown[]) => useSemanticSearchMock(...args),
  useHybridSearch: (...args: unknown[]) => useHybridSearchMock(...args),
  useSemanticStatus: () => useSemanticStatusMock(),
}));

function idleQuery<T>(data: T) {
  return { data, isLoading: false, isError: false, error: null, refetch: vi.fn() };
}

function renderSearch(initialEntry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/search" element={<SearchResultsPage />} />
          <Route path="/laws/:lawId" element={<div data-testid="law-detail" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SearchResultsPage', () => {
  beforeEach(() => {
    useSearchMock.mockReset();
    useSemanticSearchMock.mockReset();
    useHybridSearchMock.mockReset();
    useSemanticStatusMock.mockReset();
    useSearchMock.mockReturnValue(idleQuery<SearchResults>({ hits: [], total: 0 }));
    useSemanticSearchMock.mockReturnValue(idleQuery<SemanticSearchResults>({ hits: [], query: '' }));
    useHybridSearchMock.mockReturnValue(idleQuery<HybridSearchResults>({ hits: [], query: '' }));
    useSemanticStatusMock.mockReturnValue({
      data: { active: true, installed: true, backend: 'sentence-transformers', model: 'x' } satisfies SemanticStatus,
    });
  });

  it('reads q from the URL into the search field', () => {
    renderSearch('/search?q=despido');
    expect(screen.getByRole('textbox')).toHaveValue('despido');
  });

  it('shows empty-query copy and does not call search hooks for short q', () => {
    renderSearch('/search?q=a');
    expect(screen.getByText(/lenguaje natural|natural-language/i)).toBeInTheDocument();
    expect(useSearchMock).not.toHaveBeenCalled();
    expect(useSemanticSearchMock).not.toHaveBeenCalled();
    expect(useHybridSearchMock).not.toHaveBeenCalled();
  });

  it('switches mode via tabs and persists it in the URL', () => {
    renderSearch('/search?q=despido');
    fireEvent.click(screen.getByRole('button', { name: /semántico|semantic/i }));
    expect(useSemanticSearchMock).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /híbrido|hybrid/i }));
    expect(useHybridSearchMock).toHaveBeenCalled();
  });

  it('navigates to law detail from a full-text hit', () => {
    useSearchMock.mockReturnValue(idleQuery<SearchResults>({
      hits: [{
        kind: 'law',
        id: 'BOE-A-1',
        title: 'Ley de prueba',
        status: 'vigente',
        rango: 'Ley',
        publicada: '2020-01-01',
        snippet: 'texto',
        payload: { lawId: 'BOE-A-1' },
      }],
      total: 1,
    }));
    renderSearch('/search?q=prueba&mode=fulltext');
    fireEvent.click(screen.getByText('Ley de prueba'));
    expect(screen.getByTestId('law-detail')).toBeInTheDocument();
  });

  it('shows a settings callout when semantic mode is inactive', () => {
    useSemanticStatusMock.mockReturnValue({
      data: { active: false, installed: false, backend: 'hash', model: 'x' } satisfies SemanticStatus,
    });
    renderSearch('/search?q=despido&mode=semantic');
    expect(screen.getByText(/no está activa|not active/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /abrir ajustes|open settings/i })).toHaveAttribute('href', '/settings');
  });
});
