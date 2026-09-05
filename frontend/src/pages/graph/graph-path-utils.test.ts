import { describe, expect, it } from 'vitest';

import { edgeKey, pathEdgeKeys, pathNodesOutsideView } from './graph-path-utils';

describe('pathEdgeKeys', () => {
  it('builds directed keys for consecutive hops', () => {
    expect([...pathEdgeKeys(['A', 'B', 'C'])]).toEqual([edgeKey('A', 'B'), edgeKey('B', 'C')]);
  });

  it('returns empty for a single node', () => {
    expect(pathEdgeKeys(['A']).size).toBe(0);
  });
});

describe('pathNodesOutsideView', () => {
  it('returns hops missing from the loaded graph', () => {
    expect(pathNodesOutsideView(['A', 'B', 'C'], ['A', 'C'])).toEqual(['B']);
  });

  it('returns empty when the path is a subset', () => {
    expect(pathNodesOutsideView(['A', 'B'], ['A', 'B', 'C'])).toEqual([]);
  });
});
