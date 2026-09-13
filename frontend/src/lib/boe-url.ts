/** Official BOE consolidada HTML — used when `metadata.source` is missing. */
export const BOE_ACT_URL_PREFIX = 'https://www.boe.es/buscar/act.php?id=';

/** Resolve the authoritative BOE URL for a law identifier. */
export function boeActUrl(identifier: string, source?: string | null): string {
  return source || `${BOE_ACT_URL_PREFIX}${identifier}`;
}
