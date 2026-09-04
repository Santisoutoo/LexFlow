import { describe, expect, it } from 'vitest';

import type { GraphData } from '@/lib/types';

import { buildAdjacencyIndex, resolveNeighbourhood } from './neighbour-utils';

const edges: GraphData['edges'] = [
  { id: 'e0', source: 'a', target: 'b' },
  { id: 'e1', source: 'b', target: 'c' },
];

describe('buildAdjacencyIndex', () => {
  it('builds undirected 1-hop adjacency', () => {
    const adjacency = buildAdjacencyIndex(edges);
    expect(adjacency.get('a')).toEqual(new Set(['b']));
    expect(adjacency.get('b')).toEqual(new Set(['a', 'c']));
    expect(adjacency.get('c')).toEqual(new Set(['b']));
  });
});

describe('resolveNeighbourhood', () => {
  it('returns focus plus neighbours', () => {
    const adjacency = buildAdjacencyIndex(edges);
    expect(resolveNeighbourhood('b', adjacency)).toEqual(new Set(['b', 'a', 'c']));
  });

  it('returns empty set when focus is null', () => {
    const adjacency = buildAdjacencyIndex(edges);
    expect(resolveNeighbourhood(null, adjacency)).toEqual(new Set());
  });
});
