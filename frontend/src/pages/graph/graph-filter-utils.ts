/**
 * Pure filter helpers for the graph page advanced filters (#24).
 */
import type { GraphAdvancedFilters } from './GraphFilterPopover';

/**
 * Return node ids matching active advanced filters, or `null` when no filter is active.
 */
export function resolveAdvancedFilterMatches(
  nodes: { id: string; meta?: Record<string, string | number> }[],
  filters: GraphAdvancedFilters,
): Set<string> | null {
  if (filters.status.size === 0 && filters.rank.size === 0) return null;

  const ids = new Set<string>();
  for (const node of nodes) {
    const status = String(node.meta?.status ?? '');
    const rank = String(node.meta?.rank ?? '');
    const statusOk = filters.status.size === 0 || filters.status.has(status);
    const rankOk = filters.rank.size === 0 || filters.rank.has(rank);
    if (statusOk && rankOk) ids.add(node.id);
  }
  return ids;
}

/**
 * Intersect two optional match sets; `null` means "no constraint".
 */
export function intersectMatchSets(a: Set<string> | null, b: Set<string> | null): Set<string> | null {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  const result = new Set<string>();
  for (const id of a) {
    if (b.has(id)) result.add(id);
  }
  return result;
}
