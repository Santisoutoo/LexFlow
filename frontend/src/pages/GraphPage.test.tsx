import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { GraphData } from '@/lib/types';

import { GraphPage } from './GraphPage';

const useGraphMock = vi.fn();
const graphFixture: GraphData = {
  nodes: [
    { id: 'SEED-LAW', kind: 'law', label: 'Seed law', meta: { community: 1, status: 'in_force', rank: 'ley' } },
    { id: 'OTHER-LAW', kind: 'law', label: 'Other norm', meta: { community: 2, status: 'repealed', rank: 'decreto' } },
  ],
  edges: [{ id: 'e0', source: 'SEED-LAW', target: 'OTHER-LAW', kind: 'cites' }],
};

vi.mock('@/lib/queries', () => ({
  useGraph: (...args: unknown[]) => useGraphMock(...args),
  useGraphTop: () => ({ data: [{ lawId: 'TOP-LAW', score: 1, title: 'Top law' }] }),
  useWarmup: () => ({ data: { graphReady: true } }),
  useLaw: () => ({ data: undefined }),
}));

vi.mock('@/components/domain/GraphCanvasLazy', () => ({
  GraphCanvasLazy: () => <div data-testid="graph-canvas" />,
}));

function renderGraph(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <GraphPage />
    </MemoryRouter>,
  );
}

describe('GraphPage seed', () => {
  beforeEach(() => {
    useGraphMock.mockReturnValue({
      data: graphFixture,
      error: null,
      refetch: vi.fn(),
      isLoading: false,
    });
  });

  it('passes ?law= query param to useGraph as seed', async () => {
    renderGraph('/graph?law=SEED-LAW');

    await waitFor(() => {
      expect(useGraphMock).toHaveBeenCalledWith('SEED-LAW');
    });
  });

  it('prefers URL seed over top-PageRank default', async () => {
    renderGraph('/graph?law=URL-LAW');

    await waitFor(() => {
      expect(useGraphMock).toHaveBeenCalledWith('URL-LAW');
    });
    expect(useGraphMock).not.toHaveBeenCalledWith('TOP-LAW');
  });
});

describe('GraphPage controls', () => {
  beforeEach(() => {
    useGraphMock.mockReturnValue({
      data: graphFixture,
      error: null,
      refetch: vi.fn(),
      isLoading: false,
    });
  });

  it('renders search input enabled', async () => {
    renderGraph('/graph?law=SEED-LAW');
    await waitFor(() => expect(screen.getByLabelText(/buscar en el grafo/i)).toBeEnabled());
  });

  it('renders PNG export enabled', async () => {
    renderGraph('/graph?law=SEED-LAW');
    await waitFor(() => expect(screen.getByRole('button', { name: /^png$/i })).toBeEnabled());
  });

  it('renders dynamic legend clusters from graph data', async () => {
    renderGraph('/graph?law=SEED-LAW');
    await waitFor(() => {
      expect(screen.getByText(/grupo 1/i)).toBeInTheDocument();
      expect(screen.getByText(/grupo 2/i)).toBeInTheDocument();
    });
  });

  it('opens advanced filters panel', async () => {
    renderGraph('/graph?law=SEED-LAW');
    await waitFor(() => screen.getByRole('button', { name: /filtros avanzados/i }));
    fireEvent.click(screen.getByRole('button', { name: /filtros avanzados/i }));
    expect(screen.getByText(/filtros locales sobre el subgrafo/i)).toBeInTheDocument();
  });
});
