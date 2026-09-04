import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { GraphData } from '@/lib/types';

import { GraphPage } from './GraphPage';

const useGraphMock = vi.fn();
const graphFixture: GraphData = {
  nodes: [{ id: 'SEED-LAW', kind: 'law', label: 'Seed law' }],
  edges: [],
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
