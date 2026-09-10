/** Build explorer empty-state filter summary for search mode (#47). */

export interface ExplorerFilterSummaryInput {
  plainQ: string;
  status: string[];
  rango: string[];
  ambito: string[];
  tags: string[];
  jurisdiction?: string;
  yearFrom?: string;
  yearTo?: string;
  department?: string;
  userTag?: string | null;
}

export interface ExplorerFilterSummary {
  hasFilters: boolean;
  filterLabels: string[];
  suggestion: string;
}

export function buildExplorerFilterSummary(input: ExplorerFilterSummaryInput): ExplorerFilterSummary {
  const filterLabels: string[] = [];

  if (input.status.length) filterLabels.push(...input.status.map((v) => `estado=${v}`));
  if (input.rango.length) filterLabels.push(...input.rango.map((v) => `rango=${v}`));
  if (input.ambito.length) filterLabels.push(...input.ambito.map((v) => `ámbito=${v}`));
  if (input.tags.length) filterLabels.push(...input.tags.map((v) => `#${v}`));
  if (input.jurisdiction) filterLabels.push(`jurisdicción=${input.jurisdiction}`);
  if (input.yearFrom || input.yearTo) {
    filterLabels.push(`año=${input.yearFrom || '…'}–${input.yearTo || '…'}`);
  }
  if (input.department) filterLabels.push(`departamento=${input.department}`);
  if (input.userTag) filterLabels.push(`tag=${input.userTag}`);

  const hasFilters = filterLabels.length > 0;
  const suggestion = filterLabels[0] ?? 'los filtros activos';

  return { hasFilters, filterLabels, suggestion };
}
