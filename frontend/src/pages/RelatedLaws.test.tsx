import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { GraphData } from '@/lib/types';

import { RelatedLaws } from './RelatedLaws';

const graph: GraphData = {
  nodes: [
    { id: 'centre', kind: 'law', label: 'Centre' },
    { id: 'n1', kind: 'law', label: 'Neighbour 1' },
    { id: 'n2', kind: 'law', label: 'Neighbour 2' },
    { id: 'n3', kind: 'law', label: 'Neighbour 3' },
    { id: 'art', kind: 'article', label: 'Article node' },
    { id: 'far', kind: 'law', label: 'Not connected' },
  ],
  edges: [
    { id: 'e1', source: 'centre', target: 'n1', kind: 'cites' },
    { id: 'e2', source: 'centre', target: 'n2', kind: 'modifies' },
    { id: 'e3', source: 'centre', target: 'n3', kind: 'cites' },
    { id: 'e4', source: 'centre', target: 'art', kind: 'cites' },
  ],
};

describe('RelatedLaws', () => {
  it('lists only 1-hop law neighbours, not arbitrary subgraph members', () => {
    render(
      <RelatedLaws graph={graph} currentLawId="centre" onNavigate={() => undefined} />,
    );

    expect(screen.getByText('Neighbour 1')).toBeInTheDocument();
    expect(screen.getByText('Neighbour 2')).toBeInTheDocument();
    expect(screen.getByText('Neighbour 3')).toBeInTheDocument();
    expect(screen.queryByText('Article node')).not.toBeInTheDocument();
    expect(screen.queryByText('Not connected')).not.toBeInTheDocument();
  });

  it('shows the edge-kind label on each row', () => {
    render(
      <RelatedLaws graph={graph} currentLawId="centre" onNavigate={() => undefined} />,
    );

    expect(screen.getByText('Modifica')).toBeInTheDocument();
    expect(screen.getAllByText('Cita').length).toBeGreaterThanOrEqual(1);
  });

  it('navigates when a chip is clicked', async () => {
    const onNavigate = vi.fn();
    render(
      <RelatedLaws graph={graph} currentLawId="centre" onNavigate={onNavigate} />,
    );

    await userEvent.click(screen.getByText('Neighbour 2'));
    expect(onNavigate).toHaveBeenCalledWith('n2');
  });

  it('shows the inferida badge for citation-inferred neighbours', () => {
    const inferredGraph: GraphData = {
      ...graph,
      edges: [{ id: 'e1', source: 'centre', target: 'n1', kind: 'cites', resolution: 'inferred' }],
    };
    render(
      <RelatedLaws graph={inferredGraph} currentLawId="centre" onNavigate={() => undefined} />,
    );

    expect(screen.getByText('inferida')).toBeInTheDocument();
    expect(screen.getByText(/según referencias detectadas automáticamente/i)).toBeInTheDocument();
  });

  it('does not show the inferida badge for BOE-resolved neighbours', () => {
    const boeGraph: GraphData = {
      ...graph,
      edges: [{ id: 'e1', source: 'centre', target: 'n1', kind: 'cites', resolution: 'boe-id' }],
    };
    render(
      <RelatedLaws graph={boeGraph} currentLawId="centre" onNavigate={() => undefined} />,
    );

    expect(screen.queryByText('inferida')).not.toBeInTheDocument();
    expect(screen.queryByText(/según referencias detectadas automáticamente/i)).not.toBeInTheDocument();
  });
});
