import { describe, expect, it } from 'vitest';

import { firstSoleValue, toGlobalQueryFilters } from './graph-global-filters';
import type { GraphAdvancedFilters } from './GraphFilterPopover';

function emptyFilters(): GraphAdvancedFilters {
  return { status: new Set(), rank: new Set(), scope: new Set(), jurisdiction: new Set() };
}

describe('firstSoleValue', () => {
  it('returns the only member', () => {
    expect(firstSoleValue(new Set(['in_force']))).toBe('in_force');
  });

  it('returns undefined for empty or multi sets', () => {
    expect(firstSoleValue(new Set())).toBeUndefined();
    expect(firstSoleValue(new Set(['a', 'b']))).toBeUndefined();
  });
});

describe('toGlobalQueryFilters', () => {
  it('sends sole rank/status/scope and the node budget', () => {
    const filters = emptyFilters();
    filters.rank = new Set(['ley']);
    filters.status = new Set(['in_force']);
    filters.scope = new Set(['Estatal']);
    expect(toGlobalQueryFilters(filters, 500)).toEqual({
      status: 'in_force',
      rank: 'ley',
      scope: 'Estatal',
      jurisdiction: undefined,
      limit: 500,
    });
  });
});
