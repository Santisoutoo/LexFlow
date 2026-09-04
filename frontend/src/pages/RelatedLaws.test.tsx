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

  it('navigates when a chip is clicked', async () => {
    const onNavigate = vi.fn();
    render(
      <RelatedLaws graph={graph} currentLawId="centre" onNavigate={onNavigate} />,
    );

    await userEvent.click(screen.getByText('Neighbour 2'));
    expect(onNavigate).toHaveBeenCalledWith('n2');
  });
});
