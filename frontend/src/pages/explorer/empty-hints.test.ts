import { describe, expect, it } from 'vitest';
import { buildExplorerFilterSummary } from './empty-hints';

describe('buildExplorerFilterSummary', () => {
  it('returns filter labels when facets are active', () => {
    const summary = buildExplorerFilterSummary({
      plainQ: 'despido',
      status: ['vigente'],
      rango: [],
      ambito: ['Estatal'],
      tags: ['laboral'],
      jurisdiction: 'es-MD',
      yearFrom: '2010',
      yearTo: '',
      department: 'Trabajo',
      userTag: 'compliance',
    });

    expect(summary.hasFilters).toBe(true);
    expect(summary.filterLabels).toContain('estado=vigente');
    expect(summary.filterLabels).toContain('#laboral');
    expect(summary.filterLabels).toContain('jurisdicción=es-MD');
    expect(summary.suggestion).toBe('estado=vigente');
  });

  it('reports no filters when only the query is set', () => {
    const summary = buildExplorerFilterSummary({
      plainQ: 'constitucion',
      status: [],
      rango: [],
      ambito: [],
      tags: [],
    });

    expect(summary.hasFilters).toBe(false);
    expect(summary.filterLabels).toEqual([]);
  });
});
