/**
 * Pure helpers to derive legend rows from a `GraphData` payload (#24).
 */
import { type GraphEdgeKind } from '@/lib/graph-colors';
import type { GraphData, GraphNodeKind } from '@/lib/types';

const KIND_ORDER: GraphNodeKind[] = ['law', 'article', 'reference', 'amendment', 'repealed'];
const EDGE_ORDER: GraphEdgeKind[] = ['cites', 'develops', 'modifies', 'repeals'];

/**
 * Unique modularity cluster ids present in the graph, sorted ascending.
 */
export function deriveLegendCommunities(graph: GraphData): number[] {
  const communities = new Set<number>();
  for (const node of graph.nodes) {
    const community = node.meta?.community;
    if (typeof community === 'number') communities.add(community);
  }
  return [...communities].sort((a, b) => a - b);
}

/**
 * Edge kinds that actually appear in the payload, in stable display order.
 */
export function deriveLegendEdgeKinds(graph: GraphData): GraphEdgeKind[] {
  const kinds = new Set<GraphEdgeKind>();
  for (const edge of graph.edges) {
    kinds.add(edge.kind ?? 'cites');
  }
  return EDGE_ORDER.filter((kind) => kinds.has(kind));
}

/**
 * Node kinds present in the payload, in stable display order.
 */
export function deriveLegendNodeKinds(graph: GraphData): GraphNodeKind[] {
  const kinds = new Set<GraphNodeKind>();
  for (const node of graph.nodes) {
    kinds.add(node.kind);
  }
  return KIND_ORDER.filter((kind) => kinds.has(kind));
}
