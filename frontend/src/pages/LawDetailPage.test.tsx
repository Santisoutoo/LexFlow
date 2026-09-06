/**
 * Tests for LawDetailPage texto tab — deep links and empty state (#32).
 */

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LawDetailPage } from './LawDetailPage';
import type { LawDetail } from '@/lib/types';

let mockLawData: LawDetail = {
  id: 'CE-1978',
  boe: 'CE-1978',
  title: 'Constitución Española',
  short: 'Constitución',
  status: 'vigente',
  rango: 'Norma constitucional',
  publicada: '1978-12-27',
  ambito: 'Estatal',
  articulos: 1,
  referencias: 0,
  versiones: 0,
  tags: [],
  hierarchy: [
    {
      id: 'root-0::2-TÍTULO I',
      kind: 'titulo',
      label: 'TÍTULO I',
      heading: 'TÍTULO I',
      children: [{ id: 'art-14', kind: 'articulo', label: 'Art. 14' }],
    },
  ],
  articles: [
    {
      id: 'CE-1978::14',
      lawId: 'CE-1978',
      num: '14',
      titulo: 'Derecho a la igualdad',
      body: [{ marker: null, text: 'Los españoles son iguales ante la ley.', depth: 0, citations: [] }],
      refs: [],
    },
  ],
  disposiciones: [],
};

vi.mock('@/lib/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries')>();
  return {
    ...actual,
    useLaw: () => ({ data: mockLawData, isLoading: false, error: null, refetch: vi.fn() }),
    useVersions: () => ({ data: [] }),
    useUserTags: () => ({ data: [] }),
    useAddUserTag: () => ({ mutate: vi.fn() }),
    useRemoveUserTag: () => ({ mutate: vi.fn() }),
    useGraph: () => ({ data: { nodes: [], edges: [] } }),
  };
});

vi.mock('@/components/domain/GraphCanvasLazy', () => ({
  GraphCanvasLazy: () => <div data-testid="graph-canvas" />,
}));

function renderPage(initialEntry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/laws/:lawId" element={<LawDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LawDetailPage', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    mockLawData = {
      id: 'CE-1978',
      boe: 'CE-1978',
      title: 'Constitución Española',
      short: 'Constitución',
      status: 'vigente',
      rango: 'Norma constitucional',
      publicada: '1978-12-27',
      ambito: 'Estatal',
      articulos: 1,
      referencias: 0,
      versiones: 0,
      tags: [],
      hierarchy: [
        {
          id: 'root-0::2-TÍTULO I',
          kind: 'titulo',
          label: 'TÍTULO I',
          heading: 'TÍTULO I',
          children: [{ id: 'art-14', kind: 'articulo', label: 'Art. 14' }],
        },
      ],
      articles: [
        {
          id: 'CE-1978::14',
          lawId: 'CE-1978',
          num: '14',
          titulo: 'Derecho a la igualdad',
          body: [{ marker: null, text: 'Los españoles son iguales ante la ley.', depth: 0, citations: [] }],
          refs: [],
        },
      ],
      disposiciones: [],
    };
  });

  it('highlights article from #art-N deep link', async () => {
    renderPage('/laws/CE-1978#art-14');
    const articleEl = await screen.findByText('Los españoles son iguales ante la ley.');
    const block = articleEl.closest('article');
    await waitFor(() => {
      expect(block).toHaveClass('ring-2');
    });
  });

  it('shows empty state when law has no content', async () => {
    mockLawData = {
      ...mockLawData,
      articulos: 0,
      articles: [],
      hierarchy: [],
      rawText: '',
    };

    renderPage('/laws/EMPTY');
    expect(await screen.findByText(/No readable content yet|Sin contenido legible/i)).toBeInTheDocument();
  });
});
