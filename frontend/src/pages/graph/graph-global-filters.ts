/**
 * Map GraphPage advanced-filter sets onto the global-graph wire params.
 *
 * The backend accepts one value per dimension. A set of size 1 is sent;
 * empty or multi-select stay client-side (local view) / omitted (global).
 */
import type { GraphGlobalFilters } from '@/lib/types';

import type { GraphAdvancedFilters } from './GraphFilterPopover';

export function firstSoleValue(values: Set<string>): string | undefined {
  if (values.size !== 1) return undefined;
  const [only] = values;
  return only;
}

export function toGlobalQueryFilters(
  filters: GraphAdvancedFilters,
  limit: number,
): GraphGlobalFilters {
  return {
    status: firstSoleValue(filters.status),
    rank: firstSoleValue(filters.rank),
    scope: firstSoleValue(filters.scope),
    jurisdiction: firstSoleValue(filters.jurisdiction)?.trim() || undefined,
    limit,
  };
}
