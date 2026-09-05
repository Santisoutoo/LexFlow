import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { GraphData, GraphGlobalResult } from '@/lib/types';

import { GraphPage } from './GraphPage';

const useGraphMock = vi.fn();
const useGlobalGraphMock = vi.fn();
const useGraphPathMock = vi.fn();

const graphFixture: GraphData = {
  nodes: [
    { id: 'SEED-LAW', kind: 'law', label: 'Seed law', meta: { community: 1, status: 'in_force', rank: 'ley' } },
    { id: 'OTHER-LAW', kind: 'law', label: 'Other norm', meta: { community: 2, status: 'repealed', rank: 'decreto' } },
  ],
  edges: [{ id: 'e0', source: 'SEED-LAW', target: 'OTHER-LAW', kind: 'cites' }],
};

const globalFixture: GraphGlobalResult = {
  ...graphFixture,
  totalAvailable: 12000,
  truncated: true,
  limitApplied: 500,
  returnedCount: graphFixture.nodes.length,
};

vi.mock('@/lib/queries', () => ({
  useGraph: (...args: unknown[]) => useGraphMock(...args),
  useGlobalGraph: (...args: unknown[]) => useGlobalGraphMock(...args),
  useGraphPath: (...args: unknown[]) => useGraphPathMock(...args),
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

function mockLocalReady() {
  useGraphMock.mockReturnValue({
    data: graphFixture,
    error: null,
    refetch: vi.fn(),
    isLoading: false,
  });
  useGlobalGraphMock.mockReturnValue({
    data: undefined,
    error: null,
    refetch: vi.fn(),
    isLoading: false,
  });
  useGraphPathMock.mockReturnValue({
    data: undefined,
    error: null,
    isError: false,
    isFetching: false,
  });
}

describe('GraphPage seed', () => {
  beforeEach(() => {
    mockLocalReady();
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
    mockLocalReady();
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

describe('GraphPage global view', () => {
  beforeEach(() => {
    useGraphMock.mockReturnValue({
      data: undefined,
      error: null,
      refetch: vi.fn(),
      isLoading: false,
    });
    useGlobalGraphMock.mockReturnValue({
      data: globalFixture,
      error: null,
      refetch: vi.fn(),
      isLoading: false,
    });
    useGraphPathMock.mockReturnValue({
      data: undefined,
      error: null,
      isError: false,
      isFetching: false,
    });
  });

  it('calls useGlobalGraph when view=global', async () => {
    renderGraph('/graph?view=global');

    await waitFor(() => {
      expect(useGlobalGraphMock).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 500 }),
        { enabled: true },
      );
    });
    expect(screen.getByTestId('graph-canvas')).toBeInTheDocument();
  });

  it('shows truncation banner with N of M copy', async () => {
    renderGraph('/graph?view=global');
    await waitFor(() => {
      expect(screen.getByTestId('graph-truncation-banner')).toHaveTextContent(/mostrando 2 de 12000/i);
    });
  });
});

describe('GraphPage path panel', () => {
  beforeEach(() => {
    mockLocalReady();
    useGraphPathMock.mockReturnValue({
      data: ['SEED-LAW', 'OTHER-LAW'],
      error: null,
      isError: false,
      isFetching: false,
    });
  });

  it('renders path hops when from/to are in the URL', async () => {
    renderGraph('/graph?law=SEED-LAW&from=SEED-LAW&to=OTHER-LAW');
    await waitFor(() => {
      expect(useGraphPathMock).toHaveBeenCalledWith('SEED-LAW', 'OTHER-LAW');
    });
    expect(screen.getByRole('button', { name: 'SEED-LAW' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'OTHER-LAW' })).toBeInTheDocument();
  });
});
