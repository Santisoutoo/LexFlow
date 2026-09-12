/**
 * Tests for LawDetailPage texto tab — deep links and empty state (#32).
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LawDetailPage } from './LawDetailPage';
import type { LawDetail, LawVersion } from '@/lib/types';

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

let mockVersions: LawVersion[] = [];

vi.mock('@/lib/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries')>();
  return {
    ...actual,
    useLaw: () => ({ data: mockLawData, isLoading: false, error: null, refetch: vi.fn() }),
    useVersions: () => ({ data: mockVersions, isLoading: false }),
    useUserTags: () => ({ data: [] }),
    useAddUserTag: () => ({ mutate: vi.fn() }),
    useRemoveUserTag: () => ({ mutate: vi.fn() }),
    useGraph: () => ({ data: { nodes: [], edges: [] } }),
  };
});

vi.mock('@/components/domain/GraphCanvasLazy', () => ({
  GraphCanvasLazy: () => <div data-testid="graph-canvas" />,
}));

function DiffProbe() {
  const [params] = useSearchParams();
  return <div data-testid="diff-search">{params.toString()}</div>;
}

function HashNavButton({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)}>
      go-hash
    </button>
  );
}

function renderPage(initialEntry: string, hashNavTo?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/laws/:lawId"
            element={
              <>
                <LawDetailPage />
                {hashNavTo ? <HashNavButton to={hashNavTo} /> : null}
              </>
            }
          />
          <Route path="/laws/:lawId/diff" element={<DiffProbe />} />
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
    mockVersions = [];
  });

  it('highlights article from #art-N deep link', async () => {
    renderPage('/laws/CE-1978#art-14');
    const articleEl = await screen.findByText('Los españoles son iguales ante la ley.');
    const block = articleEl.closest('article');
    await waitFor(() => {
      expect(block).toHaveClass('ring-2');
    });
  });

  it('highlights article after in-page hash change (SPA nav)', async () => {
    mockLawData = {
      ...mockLawData,
      articulos: 2,
      hierarchy: [
        {
          id: 'root-0::2-TÍTULO I',
          kind: 'titulo',
          label: 'TÍTULO I',
          heading: 'TÍTULO I',
          children: [
            { id: 'art-14', kind: 'articulo', label: 'Art. 14' },
            { id: 'art-15', kind: 'articulo', label: 'Art. 15' },
          ],
        },
      ],
      articles: [
        ...mockLawData.articles,
        {
          id: 'CE-1978::15',
          lawId: 'CE-1978',
          num: '15',
          titulo: 'Derecho a la vida',
          body: [{ marker: null, text: 'Todos tienen derecho a la vida.', depth: 0, citations: [] }],
          refs: [],
        },
      ],
    };

    renderPage('/laws/CE-1978', '/laws/CE-1978#art-15');
    const art15 = await screen.findByText('Todos tienen derecho a la vida.');
    const block15 = art15.closest('article');
    expect(block15).not.toHaveClass('ring-2');
    await userEvent.click(screen.getByRole('button', { name: 'go-hash' }));
    await waitFor(() => {
      expect(block15).toHaveClass('ring-2');
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

  it('deep-links Ver cambios to the matching from/to commit pair', async () => {
    mockVersions = [
      { tag: 'bbbbbbb', date: '2024-06-01', label: 'Newest', kind: 'amend' },
      { tag: 'aaaaaaa', date: '2024-01-01', label: 'Previous', kind: 'publish' },
      { tag: '0000000', date: '2023-01-01', label: 'Oldest', kind: 'publish' },
    ];

    renderPage('/laws/CE-1978');
    await userEvent.click(screen.getByRole('tab', { name: /versiones/i }));
    const buttons = screen.getAllByRole('button', { name: /ver cambios/i });
    await userEvent.click(buttons[0]);
    expect(screen.getByTestId('diff-search').textContent).toBe('from=aaaaaaa&to=bbbbbbb');
  });

  it('groups the refs tab by source article and shows relation-kind badges', async () => {
    mockLawData = {
      ...mockLawData,
      referencias: 2,
      articles: [
        {
          id: 'CE-1978::14',
          lawId: 'CE-1978',
          num: '14',
          titulo: 'Igualdad',
          body: [{ marker: null, text: 'Cita la LO 3/2018.', depth: 0, citations: [] }],
          refs: [
            {
              label: 'LO 3/2018',
              target: { lawId: 'BOE-A-2018-16673' },
              sourceArticle: '14',
              relationKind: 'modifies',
            },
            {
              label: 'DUDH',
              sourceArticle: '14',
              relationKind: 'cites',
              inferred: true,
            },
          ],
        },
      ],
    };

    renderPage('/laws/CE-1978');
    await userEvent.click(screen.getByRole('tab', { name: /referencias/i }));
    expect(screen.getByText('Art. 14')).toBeInTheDocument();
    expect(screen.getAllByText('LO 3/2018').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Modifica')).toBeInTheDocument();
    expect(screen.getByText('Cita')).toBeInTheDocument();
  });

  it('renders four tabs and no stub Discusión tab', async () => {
    renderPage('/laws/CE-1978');
    await screen.findByText('Los españoles son iguales ante la ley.');
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    expect(tabs.map((tab) => tab.textContent ?? '').join(' ')).toMatch(/texto/i);
    expect(tabs.map((tab) => tab.textContent ?? '').join(' ')).toMatch(/versiones/i);
    expect(tabs.map((tab) => tab.textContent ?? '').join(' ')).toMatch(/grafo/i);
    expect(tabs.map((tab) => tab.textContent ?? '').join(' ')).toMatch(/referencias/i);
    expect(screen.queryByRole('tab', { name: /discusión|discussion/i })).toBeNull();
    expect(screen.queryByText(/pestaña .+ — disponible|tab — available/i)).toBeNull();
  });
});
