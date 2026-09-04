import { describe, expect, it } from 'vitest';

import type { BackendGraphEdge, BackendGraphNode } from '../../api';

import { normalizeEdgeKind, projectEdge, projectNode } from './graph';

describe('normalizeEdgeKind', () => {
  it('forwards known kinds', () => {
    expect(normalizeEdgeKind('modifies')).toBe('modifies');
    expect(normalizeEdgeKind('repeals')).toBe('repeals');
    expect(normalizeEdgeKind('develops')).toBe('develops');
    expect(normalizeEdgeKind('cites')).toBe('cites');
  });

  it('defaults null, undefined, and garbage to cites', () => {
    expect(normalizeEdgeKind(null)).toBe('cites');
    expect(normalizeEdgeKind(undefined)).toBe('cites');
    expect(normalizeEdgeKind('unknown')).toBe('cites');
  });
});

describe('projectEdge', () => {
  it('maps backend kind onto the SPA edge', () => {
    const raw: BackendGraphEdge = { source: 'A', target: 'B', kind: 'modifies' };
    expect(projectEdge(raw, 0)).toEqual({
      id: 'e-0',
      source: 'A',
      target: 'B',
      kind: 'modifies',
    });
  });

  it('falls back to cites when kind is missing', () => {
    const raw: BackendGraphEdge = { source: 'A', target: 'B' };
    expect(projectEdge(raw, 2).kind).toBe('cites');
  });
});

describe('projectNode', () => {
  it('forwards community and pagerank in meta', () => {
    const raw: BackendGraphNode = {
      id: 'LAW-1',
      title: 'Test law',
      status: 'in_force',
      rank: 'ley',
      community: 3,
      pagerank: 0.042,
    };
    expect(projectNode(raw)).toMatchObject({
      id: 'LAW-1',
      kind: 'law',
      label: 'Test law',
      meta: { community: 3, pagerank: 0.042 },
    });
  });
});
