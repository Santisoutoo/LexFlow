/**
 * GraphNodeRail — real law stats in the graph right rail (#64 S3.3).
 *
 * Replaces the retired `graph.kindDesc.*` CE-1978 mock copy. Law nodes
 * read rank/status/counts from `useLaw`; non-law kinds get a numbers-free
 * generic description.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { GraphNode } from '@/lib/types';

import { GraphNodeRail } from './GraphNodeRail';

const useLawMock = vi.fn();

vi.mock('@/lib/queries', () => ({
  useLaw: (...args: unknown[]) => useLawMock(...args),
}));

const lawNode: GraphNode = {
  id: 'BOE-A-2018-16673',
  kind: 'law',
  label: 'Ley Orgánica 3/2018',
  meta: { rank: 'ley', status: 'in_force', pagerank: 0.042 },
};

describe('GraphNodeRail', () => {
  it('renders real law stats from useLaw, not fabricated kindDesc copy', () => {
    useLawMock.mockReturnValue({
      data: {
        rango: 'Ley Orgánica',
        status: 'vigente',
        articulos: 97,
        referencias: 12,
      },
    });

    render(<GraphNodeRail node={lawNode} selectedId="BOE-A-2018-16673" />);

    expect(screen.getByText('Ley Orgánica')).toBeInTheDocument();
    expect(screen.getByText('Vigente')).toBeInTheDocument();
    expect(screen.getByText('97')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('0.042')).toBeInTheDocument();
    expect(screen.queryByText(/169 artículos/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Título I/i)).not.toBeInTheDocument();
  });

  it('renders a numbers-free fallback for article nodes', () => {
    useLawMock.mockReturnValue({ data: undefined });

    render(
      <GraphNodeRail node={{ id: 'art-1', kind: 'article', label: 'Artículo 1' }} selectedId="art-1" />,
    );

    expect(screen.getByText('Nodo del subgrafo local.')).toBeInTheDocument();
    expect(screen.queryByText(/Capítulo II/i)).not.toBeInTheDocument();
  });
});
