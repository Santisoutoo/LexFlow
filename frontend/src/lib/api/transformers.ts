/**
 * Backend → SPA shape transformers.
 *
 * The backend wire is snake_case + Spanish-locale enum strings; the
 * SPA types are camelCase + readable Spanish labels. Every translation
 * happens here so resource modules can call `transformLaw(raw)` without
 * knowing the mapping rules. Shared by laws + articles + graph + diff +
 * search endpoints.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * Backend enum values      → `RANK_MAP` / `STATUS_MAP` / `SCOPE_MAP`.
 * Article/section shape    → `transformArticle` / `sectionToHierarchy`.
 * Commit-message → kind    → `deriveVersionKind`.
 */

import type {
  BackendArticle,
  BackendArticleBodyBlock,
  BackendDiffStats,
  BackendDisposicion,
  BackendLawDetail,
  BackendLawDiff,
  BackendLawSummary,
  BackendLawVersion,
  BackendReference,
  BackendSection,
} from '../../api';
import type {
  Ambito,
  Article,
  ArticleClause,
  ArticleDiff,
  ArticleRef,
  DiffLine,
  DiffResult,
  Disposicion,
  HierarchyNode,
  Law,
  LawDetail,
  LawStatus,
  LawVersion,
  ListLawsParams,
  RangoNormativo,
  ReferenceRelationKind,
} from '../types';

/** Official BOE consolidada HTML — used when `metadata.source` is missing. */
const BOE_ACT_URL_PREFIX = 'https://www.boe.es/buscar/act.php?id=';

function boeSourceUrl(identifier: string, source?: string | null): string {
  return source || `${BOE_ACT_URL_PREFIX}${identifier}`;
}

// ─── Enum maps ───────────────────────────────────────────────────────────

// Backend LawRank enum value → SPA label. Covers every rank present in the
// live corpus (#549) so real ranks render their own label instead of
// collapsing to "Otro" — `orden` (2.4k laws), `resolucion` (800), etc. used
// to mismap here even though the backend modelled them.
export const RANK_MAP: Record<string, RangoNormativo> = {
  constitucion: 'Norma constitucional',
  ley: 'Ley',
  ley_organica: 'Ley Orgánica',
  ley_foral: 'Ley Foral',
  real_decreto: 'Real Decreto',
  real_decreto_ley: 'Real Decreto-ley',
  real_decreto_legislativo: 'RD Legislativo',
  decreto: 'Decreto',
  decreto_ley: 'Decreto-ley',
  decreto_legislativo: 'RD Legislativo',
  decreto_ley_foral: 'Decreto-ley Foral',
  decreto_foral_legislativo: 'Decreto Foral Legislativo',
  orden: 'Orden',
  resolucion: 'Resolución',
  circular: 'Circular',
  instruccion: 'Instrucción',
  acuerdo: 'Acuerdo',
  acuerdo_internacional: 'Acuerdo Internacional',
  reglamento: 'Reglamento',
  otro: 'Otro',
};

export const STATUS_MAP: Record<string, LawStatus> = {
  in_force: 'vigente',
  repealed: 'derogada',
  partially_repealed: 'modificada',
  pending: 'pendiente',
};

export const SCOPE_MAP: Record<string, Ambito> = {
  Estatal: 'Estatal',
  Autonómico: 'Autonómica',
  Local: 'Local',
};

// ─── Helpers ─────────────────────────────────────────────────────────────

function buildShortName(raw: { identifier: string; title: string }): string {
  // Drop the leading "Ley Orgánica X/YYYY, de ..." or similar — pick the first
  // 5-6 meaningful tokens after the rank prefix, or fall back to the BOE id.
  const trimmed = raw.title.replace(/^(Ley(\s+Orgánica)?|Real\s+Decreto(\s+Legislativo)?)[^,]*,?\s*(de\s+)?/i, '');
  const head = trimmed.split(/[,.]/, 1)[0].trim();
  if (head.length === 0) return raw.identifier;
  return head.length > 60 ? `${head.slice(0, 57)}…` : head;
}

function levelToKind(level: number): HierarchyNode['kind'] {
  switch (level) {
    case 2:
      return 'titulo';
    case 3:
      return 'capitulo';
    case 4:
      return 'seccion';
    case 5:
      return 'articulo';
    default:
      return 'disposicion';
  }
}

function sectionToHierarchy(section: BackendSection, path: string): HierarchyNode {
  const id = `${path}::${section.level}-${section.heading}`;
  const children: HierarchyNode[] = [
    ...(section.subsections ?? []).map((s, i) => sectionToHierarchy(s, `${id}::sub-${i}`)),
    ...(section.articles ?? []).map((a) => ({
      id: `${id}::art-${a.number}`,
      kind: 'articulo' as const,
      label: `Art. ${a.number}`,
      heading: a.title ?? undefined,
    })),
  ];
  const node: HierarchyNode = {
    id,
    kind: levelToKind(section.level),
    label: section.heading,
    heading: section.heading,
    children: children.length ? children : undefined,
  };
  if (section.text) {
    node.text = section.text;
  }
  return node;
}

// ─── Public transformers ─────────────────────────────────────────────────

export function transformLaw(raw: BackendLawSummary): Law {
  return {
    id: raw.identifier,
    boe: raw.identifier,
    title: raw.title,
    short: buildShortName(raw),
    status: STATUS_MAP[raw.status] ?? 'pendiente',
    rango: RANK_MAP[raw.rank] ?? 'Otro',
    publicada: raw.publication_date ?? '',
    ambito: SCOPE_MAP[raw.scope] ?? 'Estatal',
    articulos: raw.article_count,
    // #671 — official topic tags (BOE `subjects`). The list endpoint now
    // surfaces them so `#tag` search, tag chips and the tag filter work live
    // (before this they were dropped and only the mock carried tags).
    tags: raw.tags ?? [],
    // The list endpoint does not surface these — fill via the detail endpoint
    // when the user opens a law. Counts are advisory in the Explorer header.
    referencias: 0,
    versiones: 0,
    sourceUrl: boeSourceUrl(raw.identifier),
  };
}

export function transformLawDetail(raw: BackendLawDetail): LawDetail {
  const m = raw.metadata;
  const hierarchy = (raw.sections ?? []).map((s, i) => sectionToHierarchy(s, `root-${i}`));
  const articles = (raw.articles ?? []).map((a) => transformArticle(m.identifier, a));
  const disposiciones = (raw.disposiciones ?? []).map((d) => transformDisposicion(m.identifier, d));
  return {
    id: m.identifier,
    boe: m.identifier,
    title: m.title,
    short: buildShortName(m),
    status: STATUS_MAP[m.status] ?? 'pendiente',
    rango: RANK_MAP[m.rank] ?? 'Otro',
    publicada: m.publication_date ?? '',
    ambito: SCOPE_MAP[m.scope] ?? 'Estatal',
    articulos: raw.article_count,
    referencias: (raw.references ?? []).length,
    versiones: 0,
    // #671 — official topic tags carried on the detail metadata; drives the
    // law-header tag chips in live mode.
    tags: m.tags ?? [],
    ultimaModificacion: m.last_updated ?? undefined,
    sourceUrl: boeSourceUrl(m.identifier, m.source),
    hierarchy,
    articles,
    disposiciones,
    rawText: raw.raw_text ?? '',
  };
}

const RELATION_KINDS = new Set<ReferenceRelationKind>(['cites', 'modifies', 'repeals', 'develops']);

function toRelationKind(raw: BackendReference['kind'] | undefined): ReferenceRelationKind | undefined {
  if (raw != null && RELATION_KINDS.has(raw as ReferenceRelationKind)) {
    return raw as ReferenceRelationKind;
  }
  return undefined;
}

export function transformReference(ref: BackendReference, fallbackSource?: string): ArticleRef {
  const sourceArticle = ref.source_article || fallbackSource || undefined;
  return {
    label: ref.target_text,
    target: ref.target_id ? { lawId: ref.target_id } : undefined,
    kind: ref.target_id ? 'law' : undefined,
    sourceArticle,
    relationKind: toRelationKind(ref.kind) ?? 'cites',
    inferred: !ref.target_id,
  };
}

function citationNeedle(label: string): string {
  return label.trim().toLowerCase();
}

/**
 * Place each ref on the clause whose text contains the citation label.
 * Unmatched refs fall back to the first clause.
 */
function distributeRefs(clauses: ArticleClause[], refs: ArticleRef[]): ArticleClause[] {
  if (clauses.length === 0) return clauses;
  const assigned = clauses.map((clause) => ({ ...clause, citations: [] as ArticleRef[] }));
  for (const ref of refs) {
    const needle = citationNeedle(ref.label);
    const matchIndex =
      needle.length === 0
        ? -1
        : assigned.findIndex((clause) => citationNeedle(clause.text).includes(needle));
    const target = assigned[matchIndex >= 0 ? matchIndex : 0];
    target.citations.push(ref);
  }
  return assigned;
}

function transformBodyBlocks(
  blocks: BackendArticleBodyBlock[] | undefined,
  fallbackText: string,
  refs: ArticleRef[],
): ArticleClause[] {
  if (blocks && blocks.length > 0) {
    const clauses = blocks.map((block) => ({
      marker: block.marker ?? null,
      text: block.text,
      depth: block.depth ?? 0,
      citations: [] as ArticleRef[],
    }));
    return distributeRefs(clauses, refs);
  }
  return [{ marker: null, text: fallbackText, depth: 0, citations: refs }];
}

export function transformArticle(lawId: string, raw: BackendArticle): Article {
  const refs = (raw.references ?? []).map((ref) => transformReference(ref, raw.number));
  return {
    id: `${lawId}::${raw.number}`,
    lawId,
    num: raw.number,
    titulo: raw.title ?? '',
    body: transformBodyBlocks(raw.blocks, raw.text, refs),
    refs,
  };
}

export function transformDisposicion(lawId: string, raw: BackendDisposicion): Disposicion {
  const fallbackSource = raw.number ?? raw.heading;
  const refs = (raw.references ?? []).map((ref) => transformReference(ref, fallbackSource));
  return {
    heading: raw.heading,
    kind: raw.kind,
    number: raw.number ?? null,
    title: raw.title ?? null,
    text: raw.text,
    body: transformBodyBlocks(raw.blocks, raw.text, refs),
    refs,
  };
}

// ─── Version + diff transformers ─────────────────────────────────────────

/** Heuristic for surfacing a useful tag + kind from a git commit message.
 * legalize-es commits look like "feat(...): Ley XX/YYYY, de ... (norma=...)".
 */
function deriveVersionKind(message: string): LawVersion['kind'] {
  const m = message.toLowerCase();
  if (/derog|repeal/.test(m)) return 'repeal';
  if (/consolid/.test(m)) return 'consolidate';
  // CodeQL alert #1 (#252 hardening): the previous pattern
  // `^feat\(publi|public` parses as `^feat\(publi` OR `public` — the
  // anchor only covers the first branch. We anchor both at a word
  // boundary so intent (catch publish/public/publica…) is preserved
  // without the misleading-precedence trap.
  if (/\b(publish|public)/.test(m)) return 'publish';
  return 'amend';
}

export function transformVersion(raw: BackendLawVersion): LawVersion {
  const subject = raw.message.split('\n', 1)[0].trim();
  const affected = raw.articulos_afectados ?? [];
  return {
    tag: raw.commit_hash.slice(0, 7),
    date: raw.date,
    label: raw.disposicion ?? raw.norma ?? subject.slice(0, 80),
    kind: deriveVersionKind(raw.message),
    changedArticles: affected.length ? affected : undefined,
  };
}

function buildVersionStub(commit: string, date: string | null): LawVersion {
  // When the backend gives us only the commit hash + date for the endpoints
  // of a diff, synthesise a minimal LawVersion so the DiffViewer can render
  // its left/right metadata.
  return {
    tag: commit.slice(0, 7),
    date: date ?? '',
    label: commit.slice(0, 7),
    kind: 'amend',
  };
}

type ClassifiedDiffLine = DiffLine;

function isDiffHeader(raw: string): boolean {
  return raw.startsWith('+++') || raw.startsWith('---') || raw.startsWith('@@') || raw.startsWith('diff ');
}

function classifyDiffLine(raw: string): ClassifiedDiffLine | null {
  if (isDiffHeader(raw)) return null;
  if (raw.startsWith('+')) return { t: 'add', s: raw.slice(1) };
  if (raw.startsWith('-')) return { t: 'del', s: raw.slice(1) };
  const s = raw.startsWith(' ') ? raw.slice(1) : raw;
  return { t: 'eq', s };
}

function classifyUnifiedDiff(text: string): ClassifiedDiffLine[] {
  const out: ClassifiedDiffLine[] = [];
  for (const raw of text.split('\n')) {
    const line = classifyDiffLine(raw);
    if (line) out.push(line);
  }
  return out;
}

function linesToSides(lines: ClassifiedDiffLine[]): {
  left: ClassifiedDiffLine[];
  right: ClassifiedDiffLine[];
  added: number;
  removed: number;
} {
  const left: ClassifiedDiffLine[] = [];
  const right: ClassifiedDiffLine[] = [];
  for (const line of lines) {
    if (line.t === 'add') {
      right.push(line);
    } else if (line.t === 'del') {
      left.push(line);
    } else {
      left.push(line);
      right.push(line);
    }
  }
  return {
    left,
    right,
    added: right.filter((l) => l.t === 'add').length,
    removed: left.filter((l) => l.t === 'del').length,
  };
}

function articleDiffFromLines(num: string, titulo: string, lines: ClassifiedDiffLine[]): ArticleDiff {
  const sides = linesToSides(lines);
  return {
    num,
    titulo,
    left: { tag: '', date: '', lines: sides.left },
    right: { tag: '', date: '', lines: sides.right },
    totals: { added: sides.added, removed: sides.removed },
  };
}

/**
 * Markdown / prose heading for an article. Anchored at the start (optional
 * ATX hashes) so body mentions like "según el Artículo 23" don't open a bucket.
 * Spirit of backend `_ARTICLE_HEADING_RE` (`Art[ií]culo\s+(\S+)`).
 */
const ARTICLE_HEADING_RE = /^(?:#{1,6}\s+)?Art[ií]culo\s+(\S+?)\.?\s*(.*?)\s*$/i;

function matchArticleHeading(text: string): { num: string; titulo: string } | null {
  const match = ARTICLE_HEADING_RE.exec(text.trim());
  if (!match) return null;
  const num = (match[1] ?? '').replace(/\.$/, '');
  if (!num) return null;
  const titulo = (match[2] ?? '').replace(/\.$/, '').trim();
  return { num, titulo };
}

interface ArticleBucket {
  num: string;
  titulo: string;
  lines: ClassifiedDiffLine[];
}

function mergeBucketsByNum(buckets: ArticleBucket[]): ArticleBucket[] {
  const byNum = new Map<string, ArticleBucket>();
  const order: string[] = [];
  for (const bucket of buckets) {
    const existing = byNum.get(bucket.num);
    if (!existing) {
      byNum.set(bucket.num, { num: bucket.num, titulo: bucket.titulo, lines: [...bucket.lines] });
      order.push(bucket.num);
      continue;
    }
    existing.lines.push(...bucket.lines);
    if (existing.titulo.startsWith('Artículo ') && !bucket.titulo.startsWith('Artículo ')) {
      existing.titulo = bucket.titulo;
    }
  }
  return order.map((num) => byNum.get(num)).filter((bucket): bucket is ArticleBucket => bucket != null);
}

function parseUnifiedDiffByArticles(diffText: string, changedArticles?: string[]): ArticleDiff[] {
  const classified = classifyUnifiedDiff(diffText);
  const buckets: ArticleBucket[] = [];
  let current: ArticleBucket | null = null;
  const preamble: ClassifiedDiffLine[] = [];

  for (const line of classified) {
    const heading = matchArticleHeading(line.s);
    if (heading) {
      if (current && current.num === heading.num) {
        current.lines.push(line);
        if (heading.titulo) current.titulo = heading.titulo;
        continue;
      }
      current = { num: heading.num, titulo: heading.titulo || `Artículo ${heading.num}`, lines: [line] };
      buckets.push(current);
      continue;
    }
    if (current) {
      current.lines.push(line);
    } else {
      preamble.push(line);
    }
  }

  if (buckets.length === 0) {
    return [articleDiffFromLines('todo', 'Diff completo', classified)];
  }

  const merged = mergeBucketsByNum(buckets);
  if (preamble.length > 0 && merged[0]) {
    merged[0].lines = [...preamble, ...merged[0].lines];
  }

  const parsed = merged.map((bucket) => articleDiffFromLines(bucket.num, bucket.titulo, bucket.lines));
  if (!changedArticles || changedArticles.length === 0) return parsed;

  const byNum = new Map(parsed.map((article) => [article.num, article]));
  const ordered: ArticleDiff[] = [];
  for (const num of changedArticles) {
    const article = byNum.get(num);
    if (article) {
      ordered.push(article);
      byNum.delete(num);
    }
  }
  for (const article of parsed) {
    if (byNum.has(article.num)) ordered.push(article);
  }
  return ordered;
}

export function transformDiff(raw: BackendLawDiff): DiffResult {
  const changedArticles = raw.stats.changed_articles ?? [];
  const articles = parseUnifiedDiffByArticles(raw.diff_text, changedArticles);
  const stats: BackendDiffStats = raw.stats;
  return {
    lawId: raw.law_id,
    from: buildVersionStub(raw.from_commit, raw.from_date ?? null),
    to: buildVersionStub(raw.to_commit, raw.to_date ?? null),
    articles,
    totals: {
      added: stats.additions,
      removed: stats.deletions,
      modified: changedArticles.length,
    },
  };
}

// ─── Param mapping for laws.list ─────────────────────────────────────────

export function listLawsQuery(params: ListLawsParams): Record<string, unknown> {
  // The backend list endpoint currently accepts single-value filters
  // (rank, status, scope, jurisdiction) plus pagination. Multi-select on the
  // frontend collapses to the first value until the backend supports IN-lists.
  return {
    page: params.cursor ? Number(params.cursor) : 1,
    page_size: params.limit ?? 20,
    rank: params.rango?.[0]
      ? Object.entries(RANK_MAP).find(([, v]) => v === params.rango?.[0])?.[0]
      : undefined,
    status: params.status?.[0]
      ? Object.entries(STATUS_MAP).find(([, v]) => v === params.status?.[0])?.[0]
      : undefined,
    scope: params.ambito?.[0]
      ? Object.entries(SCOPE_MAP).find(([, v]) => v === params.ambito?.[0])?.[0]
      : undefined,
    // #563 — publication-year range. Sent straight through; the backend
    // filters on `publication_date.year` (inclusive).
    year_from: params.yearFrom,
    year_to: params.yearTo,
    // Autonomous community filter — passed straight through; the backend
    // `jurisdiction` param accepts the NUTS-1 code as-is (e.g. `'es-md'`).
    // Omitted when undefined so the backend returns all jurisdictions.
    jurisdiction: params.jurisdiction,
    // #671 — official topic tags, AND-filtered server-side (`qs` serialises
    // the array as repeated `?tags=a&tags=b`). Makes tag browse corpus-wide
    // instead of page-scoped; the client fallback then re-ANDs harmlessly.
    tags: params.tags,
    // #671 gap B — issuing department (ministerio), exact match. Passed
    // straight through, same shape as `jurisdiction`.
    department: params.department,
    // Home's "Qué ha cambiado" and `/explorer?sort=date` need the corpus
    // ordered by publication date. `refs` is explorer-only: LawSummary has
    // no reference_count, so that key stays page-scoped in
    // `applyClientFilterSort` and is never sent.
    sort: params.sort === 'date' || params.sort === 'title' ? params.sort : undefined,
  };
}
