/**
 * Pure graph-neighbour utilities for GraphPage.
 *
 * Extracted from `GraphPage` to shrink that god component and make the
 * data-shaping logic unit-testable (#556). Neither function touches React
 * or any hook — they transform plain `GraphData` values.
 *
 * WHERE TO CHANGE IF X CHANGES: if `GraphNode` or `GraphEdge` gain new
 * fields that affect neighbour resolution (e.g. weight, directionality
 * flags), update `NeighbourEdge` and `resolveNeighbourNodes` here.
 */
import type { GraphData, GraphNode, GraphEdge } from '@/lib/types';

/** Maximum number of neighbour edges surfaced in the right-rail. */
const MAX_NEIGHBOURS = 12;

/** Default cap for related-law chips on the law-detail rail. */
export const MAX_RELATED_LAWS = 10;

/**
 * Build a stable `id → GraphNode` index from a node array.
 *
 * Use the result inside a `useMemo` keyed on `graph.nodes` to avoid
 * rebuilding the map on every render.
 *
 * @param nodes - The node list from a `GraphData` response.
 * @returns A `Map` keyed by node id.
 */
export function buildNodeIndex(nodes: GraphData['nodes']): Map<string, GraphNode> {
  const index = new Map<string, GraphNode>();
  for (const node of nodes) {
    index.set(node.id, node);
  }
  return index;
}

/**
 * One resolved neighbour: the raw edge plus the `GraphNode` on the other end.
 *
 * `otherNode` is never `undefined` — `resolveNeighbourNodes` skips edges
 * whose other endpoint is absent from `nodeIndex`.
 */
export interface ResolvedNeighbour {
  edge: GraphEdge;
  /** The node on the far end of `edge` (not the selected node). */
  otherNode: GraphNode;
  /** Id of the other node — convenience alias for `otherNode.id`. */
  otherId: string;
}

/**
 * Return the resolved neighbours for the currently selected node.
 *
 * Finds every edge that touches `selectedId`, resolves the far endpoint
 * via `nodeIndex`, discards edges whose endpoint is missing, and caps
 * the result at `MAX_NEIGHBOURS` to avoid flooding the right-rail.
 *
 * Returns an empty array when `selectedId` is `null`.
 *
 * @param edges      - Full edge list from a `GraphData` response.
 * @param nodeIndex  - Pre-built index from `buildNodeIndex`.
 * @param selectedId - Currently selected node id, or `null`.
 */
export function resolveNeighbourNodes(
  edges: GraphData['edges'],
  nodeIndex: Map<string, GraphNode>,
  selectedId: string | null,
): ResolvedNeighbour[] {
  if (!selectedId) return [];

  const result: ResolvedNeighbour[] = [];

  for (const edge of edges) {
    if (result.length >= MAX_NEIGHBOURS) break;

    const isTouching = edge.source === selectedId || edge.target === selectedId;
    if (!isTouching) continue;

    const otherId = edge.source === selectedId ? edge.target : edge.source;
    const otherNode = nodeIndex.get(otherId);
    if (!otherNode) continue;

    result.push({ edge, otherNode, otherId });
  }

  return result;
}

/**
 * Build an undirected 1-hop adjacency index from edge endpoints.
 */
export function buildAdjacencyIndex(edges: GraphData['edges']): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();

  const link = (a: string, b: string) => {
    const bucket = adjacency.get(a) ?? new Set<string>();
    bucket.add(b);
    adjacency.set(a, bucket);
  };

  for (const edge of edges) {
    link(edge.source, edge.target);
    link(edge.target, edge.source);
  }

  return adjacency;
}

/**
 * Return the focus node plus its 1-hop neighbours for hover/selection highlight.
 */
export function resolveNeighbourhood(
  focusId: string | null,
  adjacency: Map<string, Set<string>>,
): Set<string> {
  if (!focusId) return new Set();

  const neighbourhood = new Set<string>([focusId]);
  const neighbours = adjacency.get(focusId);
  if (!neighbours) return neighbourhood;

  for (const id of neighbours) neighbourhood.add(id);
  return neighbourhood;
}

/**
 * Return 1-hop law neighbours of `currentLawId` for the related-laws rail.
 *
 * Deduplicates by target id (a law can be linked by multiple edges) and
 * ignores non-law nodes. Caps at `max`.
 */
export function resolveRelatedLawNeighbours(
  graph: GraphData,
  currentLawId: string,
  max = MAX_RELATED_LAWS,
): GraphNode[] {
  const index = buildNodeIndex(graph.nodes);
  const neighbours = resolveNeighbourNodes(graph.edges, index, currentLawId);
  const seen = new Set<string>();
  const result: GraphNode[] = [];

  for (const { otherNode, otherId } of neighbours) {
    if (otherNode.kind !== 'law' || otherId === currentLawId || seen.has(otherId)) continue;
    seen.add(otherId);
    result.push(otherNode);
    if (result.length >= max) break;
  }

  return result;
}
