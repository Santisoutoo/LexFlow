/**
 * Shared full-text matching helpers mirroring `lexflow.core.search` (#47).
 *
 * Used by the in-process mock so dev/offline search agrees with the backend
 * on token AND semantics and accent folding.
 */

/** Strip leading/trailing punctuation per token; keep inner punctuation (LO, 1/2004). */
const TOKEN_EDGE_PUNCT = '.,;:!?"\'()[]';

/** Required for AND matching but excluded from score contribution in the backend. */
const SCORE_STOPWORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'y', 'en', 'del', 'al', 'a', 'un', 'una', 'por', 'con', 'que',
]);

/** Curated acronym map — keep in sync with `law_aliases.LAW_ALIASES`. */
export const LAW_ALIAS_MAP: Record<string, string> = {
  CE: 'constitución española',
  CC: 'código civil',
  CP: 'código penal',
  LOPD: 'protección de datos personales',
  LOPDGDD: 'protección de datos personales',
  LEC: 'enjuiciamiento civil',
  LECRIM: 'enjuiciamiento criminal',
  LGT: 'general tributaria',
  LGSS: 'general de la seguridad social',
  ET: 'estatuto de los trabajadores',
  LOE: 'ordenación de la edificación',
  LRJSP: 'régimen jurídico del sector público',
  LPAC: 'procedimiento administrativo común de las administraciones públicas',
  LOPJ: 'poder judicial',
  LBRL: 'bases del régimen local',
  LSC: 'sociedades de capital',
  LJCA: 'jurisdicción contencioso-administrativa',
  LCSP: 'contratos del sector público',
  LOFAGE: 'organización y funcionamiento de la administración general del estado',
  LOTC: 'tribunal constitucional',
  LOPSC: 'protección de la seguridad ciudadana',
  TRLGDCU: 'defensa de los consumidores y usuarios',
  LAU: 'arrendamientos urbanos',
  LC: 'ley concursal',
  LPI: 'propiedad intelectual',
  LPH: 'propiedad horizontal',
  LMV: 'mercado de valores',
  LGP: 'general presupuestaria',
  LOREG: 'régimen electoral general',
  LOFCS: 'fuerzas y cuerpos de seguridad',
  LODP: 'defensor del pueblo',
  LOLS: 'libertad sindical',
  LISOS: 'infracciones y sanciones en el orden social',
  'LO 1/2004': 'medidas de protección integral contra la violencia de género',
  LOVG: 'medidas de protección integral contra la violencia de género',
  'LO 3/2007': 'igualdad efectiva de mujeres y hombres',
  LOPIVI: 'protección integral a la infancia y la adolescencia frente a la violencia',
};

export interface AliasExpansion {
  token: string;
  expansion: string;
}

export function foldForSearch(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeQuery(query: string): string[] {
  const tokens: string[] = [];
  for (const raw of query.split(/\s+/)) {
    const token = raw.replace(new RegExp(`^[${TOKEN_EDGE_PUNCT}]+|[${TOKEN_EDGE_PUNCT}]+$`, 'g'), '');
    if (token) tokens.push(token);
  }
  return tokens;
}

export function prepareSearchTokens(query: string): string[] {
  return tokenizeQuery(query)
    .map((token) => foldForSearch(token))
    .filter(Boolean);
}

function normalizeAlias(token: string): string {
  return token.trim().split(/\s+/).join(' ').toUpperCase();
}

export function expandAliasesInQuery(query: string): { expandedQuery: string; aliasExpansions: AliasExpansion[] } {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return { expandedQuery: query, aliasExpansions: [] };

  if (tokens.length === 1) {
    const expansion = LAW_ALIAS_MAP[normalizeAlias(query)];
    if (expansion) {
      return { expandedQuery: expansion, aliasExpansions: [{ token: tokens[0], expansion }] };
    }
    return { expandedQuery: query, aliasExpansions: [] };
  }

  const aliasExpansions: AliasExpansion[] = [];
  const expandedTokens: string[] = [];
  for (const token of tokens) {
    const expansion = LAW_ALIAS_MAP[normalizeAlias(token)];
    if (expansion) {
      aliasExpansions.push({ token, expansion });
      expandedTokens.push(expansion);
    } else {
      expandedTokens.push(token);
    }
  }
  return { expandedQuery: expandedTokens.join(' '), aliasExpansions };
}

export function matchesAllTokens(haystack: string, tokens: string[]): boolean {
  const folded = foldForSearch(haystack);
  return tokens.every((token) => folded.includes(token));
}

export function scoreTokens(haystack: string, title: string, tokens: string[]): number {
  if (!matchesAllTokens(haystack, tokens)) return 0;
  const folded = foldForSearch(haystack);
  const titleFolded = foldForSearch(title);
  let score = 0;
  for (const token of tokens) {
    if (SCORE_STOPWORDS.has(token)) continue;
    const count = folded.split(token).length - 1;
    score += Math.min(count, 5);
  }
  if (score === 0) score = 1;
  const significant = tokens.filter((token) => !SCORE_STOPWORDS.has(token));
  if (significant.length > 0 && significant.every((token) => titleFolded.includes(token))) {
    score *= 3;
  }
  return score;
}

export function locateAllTokens(
  text: string,
  tokens: string[],
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  for (const token of tokens) {
    const found = locateFoldedToken(text, token);
    if (found) ranges.push(found);
  }
  return mergeRanges(ranges);
}

function locateFoldedToken(text: string, token: string): { start: number; end: number } | null {
  const needle = foldForSearch(token);
  if (!needle) return null;
  for (let start = 0; start < text.length; start += 1) {
    const match = matchFoldedAt(text, start, needle);
    if (match) return match;
  }
  return null;
}

function matchFoldedAt(text: string, start: number, needle: string): { start: number; end: number } | null {
  let pos = start;
  let needlePos = 0;
  let origStart: number | null = null;
  let origEnd = start;

  while (needlePos < needle.length) {
    if (needle[needlePos] === ' ') {
      if (!consumeFoldedSpace(text, pos)) return null;
      while (pos < text.length) {
        const folded = foldCharAt(text, pos);
        if (!folded) {
          pos += 1;
          continue;
        }
        if (folded.char === ' ') pos = folded.next;
        else break;
      }
      needlePos += 1;
      continue;
    }

    while (pos < text.length) {
      const folded = foldCharAt(text, pos);
      if (!folded) {
        pos += 1;
        continue;
      }
      if (folded.char === ' ') {
        pos = folded.next;
        continue;
      }
      if (folded.char !== needle[needlePos]) return null;
      if (origStart === null) origStart = pos;
      origEnd = folded.next;
      pos = folded.next;
      needlePos += 1;
      break;
    }
    if (pos > text.length) return null;
  }

  return origStart === null ? null : { start: origStart, end: origEnd };
}

function foldCharAt(text: string, index: number): { char: string; next: number } | null {
  if (index >= text.length) return null;
  const nfkd = text[index].normalize('NFKD').toLowerCase();
  const visible = [...nfkd].filter((c) => !/\p{M}/u.test(c));
  if (visible.length === 0) return null;
  if (visible.every((c) => /\s/.test(c))) return { char: ' ', next: index + 1 };
  return { char: visible[0], next: index + 1 };
}

function consumeFoldedSpace(text: string, pos: number): boolean {
  let scan = pos;
  while (scan < text.length) {
    const folded = foldCharAt(text, scan);
    if (!folded) {
      scan += 1;
      continue;
    }
    if (folded.char === ' ') return true;
    return false;
  }
  return false;
}

function mergeRanges(ranges: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged = [sorted[0]];
  for (const range of sorted.slice(1)) {
    const prev = merged[merged.length - 1];
    if (range.start <= prev.end) {
      prev.end = Math.max(prev.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}
