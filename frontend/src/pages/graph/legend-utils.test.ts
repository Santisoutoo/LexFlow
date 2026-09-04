import { describe, expect, it } from 'vitest';

import type { GraphData } from '@/lib/types';

import { deriveLegendCommunities, deriveLegendEdgeKinds, deriveLegendNodeKinds } from './legend-utils';

const graph: GraphData = {
  nodes: [
    { id: 'a', kind: 'law', label: 'A', meta: { community: 2 } },
    { id: 'b', kind: 'article', label: 'B', meta: { community: 1 } },
    { id: 'c', kind: 'law', label: 'C', meta: { community: 2 } },
  ],
  edges: [
    { id: 'e0', source: 'a', target: 'b', kind: 'modifies' },
    { id: 'e1', source: 'b', target: 'c', kind: 'cites' },
  ],
};

describe('legend-utils', () => {
  it('lists unique communities in ascending order', () => {
    expect(deriveLegendCommunities(graph)).toEqual([1, 2]);
  });

  it('lists only edge kinds present in the payload', () => {
    expect(deriveLegendEdgeKinds(graph)).toEqual(['cites', 'modifies']);
  });

  it('lists only node kinds present in the payload', () => {
    expect(deriveLegendNodeKinds(graph)).toEqual(['law', 'article']);
  });
});
