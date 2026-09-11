/**
 * Parse / serialize Explorer q, filters, and sort as URL search params.
 *
 * Missing params re-apply the page defaults (`status=vigente`,
 * `ambito=Estatal`, `sort=relevance`) so `/explorer` stays a short URL.
 * An explicit empty value (`status=`, `ambito=`) means "no filter" —
 * distinct from the default — so Clear filters can round-trip.
 *
 * `q` typing should commit with `{ replace: true }` (same as /search);
 * chip / sort changes push a history entry so Back restores them.
 */
import { COMMUNITIES } from '@/lib/types';
import type { Ambito, JurisdictionCode, LawStatus, RangoNormativo } from '@/lib/types';
import type { LawSort } from '@/pages/explorer/client-filter-sort';

const DEFAULT_STATUS: LawStatus = 'vigente';
const DEFAULT_AMBITO: Ambito = 'Estatal';
const DEFAULT_SORT: LawSort = 'relevance';

const STATUSES = new Set<LawStatus>(['vigente', 'modificada', 'derogada', 'pendiente']);
const AMBITOS = new Set<Ambito>(['Estatal', 'UE', 'Autonómica', 'Local']);
const SORTS = new Set<LawSort>(['relevance', 'date', 'refs', 'title']);
const COMMUNITY_CODES = new Set<string>(COMMUNITIES.map((c) => c.code));

const RANGOS = new Set<RangoNormativo>([
  'Norma constitucional',
  'Ley Orgánica',
  'Ley',
  'Ley Foral',
  'Real Decreto',
  'RD Legislativo',
  'Decreto',
  'Decreto-ley',
  'Decreto-ley Foral',
  'Decreto Foral Legislativo',
  'Orden',
  'Resolución',
  'Circular',
  'Instrucción',
  'Acuerdo',
  'Acuerdo Internacional',
  'Reglamento',
  'Reglamento UE',
  'Decisión',
  'Otro',
]);

export interface ExplorerUrlState {
  q: string;
  tags: Set<string>;
  status: Set<LawStatus>;
  rango: Set<RangoNormativo>;
  ambito: Set<Ambito>;
  yearFrom: string;
  yearTo: string;
  jurisdiction: JurisdictionCode | undefined;
  department: string | undefined;
  activeUserTag: string | null;
  sort: LawSort;
}

export function defaultExplorerState(): ExplorerUrlState {
  return {
    q: '',
    tags: new Set(),
    status: new Set([DEFAULT_STATUS]),
    rango: new Set(),
    ambito: new Set([DEFAULT_AMBITO]),
    yearFrom: '',
    yearTo: '',
    jurisdiction: undefined,
    department: undefined,
    activeUserTag: null,
    sort: DEFAULT_SORT,
  };
}

/** Empty filters (Clear filters): all statuses/ámbitos, no q/tags/sort. */
export function clearedExplorerState(): ExplorerUrlState {
  return {
    ...defaultExplorerState(),
    status: new Set(),
    ambito: new Set(),
  };
}

export function parseExplorerParams(searchParams: URLSearchParams): ExplorerUrlState {
  const defaults = defaultExplorerState();
  return {
    q: searchParams.get('q') ?? '',
    tags: parseCsv(searchParams.get('tags')),
    status: parseEnumSet(searchParams.get('status'), STATUSES, defaults.status),
    rango: parseEnumSet(searchParams.get('rango'), RANGOS, defaults.rango),
    ambito: parseEnumSet(searchParams.get('ambito'), AMBITOS, defaults.ambito),
    yearFrom: searchParams.get('yearFrom') ?? '',
    yearTo: searchParams.get('yearTo') ?? '',
    jurisdiction: parseJurisdiction(searchParams.get('jurisdiction')),
    department: searchParams.get('department') || undefined,
    activeUserTag: searchParams.get('userTag') || null,
    sort: parseSort(searchParams.get('sort')),
  };
}

export function serializeExplorerParams(state: ExplorerUrlState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  writeCsv(params, 'tags', state.tags);
  writeEnumSet(params, 'status', state.status, DEFAULT_STATUS);
  writeCsv(params, 'rango', state.rango);
  writeEnumSet(params, 'ambito', state.ambito, DEFAULT_AMBITO);
  if (state.yearFrom) params.set('yearFrom', state.yearFrom);
  if (state.yearTo) params.set('yearTo', state.yearTo);
  if (state.jurisdiction) params.set('jurisdiction', state.jurisdiction);
  if (state.department) params.set('department', state.department);
  if (state.activeUserTag) params.set('userTag', state.activeUserTag);
  if (state.sort !== DEFAULT_SORT) params.set('sort', state.sort);
  return params;
}

function parseCsv(raw: string | null): Set<string> {
  if (!raw) return new Set();
  return new Set(raw.split(',').map((part) => part.trim()).filter(Boolean));
}

function parseEnumSet<T extends string>(
  raw: string | null,
  allowed: Set<T>,
  whenMissing: Set<T>,
): Set<T> {
  if (raw === null) return new Set(whenMissing);
  if (raw === '') return new Set();
  const next = new Set<T>();
  for (const part of raw.split(',')) {
    const value = part.trim();
    if (allowed.has(value as T)) next.add(value as T);
  }
  return next;
}

function parseJurisdiction(raw: string | null): JurisdictionCode | undefined {
  if (!raw || !COMMUNITY_CODES.has(raw)) return undefined;
  return raw as JurisdictionCode;
}

function parseSort(raw: string | null): LawSort {
  if (raw && SORTS.has(raw as LawSort)) return raw as LawSort;
  return DEFAULT_SORT;
}

function writeCsv(params: URLSearchParams, key: string, values: Set<string>): void {
  if (values.size === 0) return;
  params.set(key, [...values].join(','));
}

function writeEnumSet<T extends string>(
  params: URLSearchParams,
  key: string,
  values: Set<T>,
  defaultValue: T,
): void {
  if (values.size === 1 && values.has(defaultValue)) return;
  if (values.size === 0) {
    params.set(key, '');
    return;
  }
  params.set(key, [...values].join(','));
}
