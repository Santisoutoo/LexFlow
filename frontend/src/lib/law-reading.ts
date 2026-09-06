/**
 * Pure helpers for law-detail reading flow: ordered items, TOC flattening,
 * and deep-link hash parsing. Shared by TextoTab, LawToc, and tests.
 */

import type { Article, Disposicion, HierarchyNode, LawDetail } from './types';

export type ReadingItem =
  | { kind: 'section'; node: HierarchyNode; targetId: string; depth: number }
  | { kind: 'article'; article: Article }
  | { kind: 'disposicion'; disposicion: Disposicion }
  | { kind: 'raw'; markdown: string };

export interface TocEntry {
  id: string;
  label: string;
  depth: number;
  targetId: string;
  kind: HierarchyNode['kind'];
}

/** Virtualize when the reading list exceeds this many rows. */
export const VIRTUALIZE_THRESHOLD = 50;

/** Slugify a hierarchy node id into a stable DOM / hash target. */
export function sectionTargetId(nodeId: string): string {
  const slug = nodeId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `section-${slug || 'node'}`;
}

export function articleTargetId(num: string): string {
  return `art-${num}`;
}

export function parseArticleHash(hash: string): string | null {
  if (!hash.startsWith('#art-')) return null;
  const raw = hash.slice('#art-'.length);
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function walkHierarchy(
  nodes: HierarchyNode[],
  articleMap: Map<string, Article>,
  visited: Set<string>,
  out: ReadingItem[],
  depth: number,
): void {
  for (const node of nodes) {
    if (node.kind === 'articulo') {
      const num = node.label.replace(/^Art\.\s*/i, '').trim();
      const article = articleMap.get(num);
      if (article) {
        visited.add(article.num);
        out.push({ kind: 'article', article });
      }
      continue;
    }

    const targetId = sectionTargetId(node.id);
    out.push({ kind: 'section', node, targetId, depth });

    if (node.children?.length) {
      walkHierarchy(node.children, articleMap, visited, out, depth + 1);
    }
  }
}

function appendOrphanArticles(
  articles: Article[],
  visited: Set<string>,
  out: ReadingItem[],
): void {
  for (const article of articles) {
    if (visited.has(article.num)) continue;
    out.push({ kind: 'article', article });
  }
}

function appendDisposiciones(disposiciones: Disposicion[], out: ReadingItem[]): void {
  for (const disposicion of disposiciones) {
    out.push({ kind: 'disposicion', disposicion });
  }
}

export interface BuildReadingItemsInput {
  hierarchy: HierarchyNode[];
  articles: Article[];
  disposiciones: Disposicion[];
  rawText?: string;
}

/** Build the ordered reading sequence for the texto tab. */
export function buildReadingItems(input: BuildReadingItemsInput): ReadingItem[] {
  const articleMap = new Map(input.articles.map((a) => [a.num, a]));
  const visited = new Set<string>();
  const out: ReadingItem[] = [];

  walkHierarchy(input.hierarchy, articleMap, visited, out, 0);

  if (input.articles.length === 0) {
    const hasSectionContent = out.some((item) => item.kind === 'section');
    if (!hasSectionContent) {
      if (input.rawText?.trim()) {
        out.push({ kind: 'raw', markdown: input.rawText });
      }
      appendDisposiciones(input.disposiciones, out);
      return out;
    }
  } else {
    appendOrphanArticles(input.articles, visited, out);
  }

  appendDisposiciones(input.disposiciones, out);
  return out;
}

export function flattenToc(hierarchy: HierarchyNode[]): TocEntry[] {
  const out: TocEntry[] = [];

  function walk(nodes: HierarchyNode[], depth: number): void {
    for (const node of nodes) {
      if (node.kind === 'articulo') {
        const num = node.label.replace(/^Art\.\s*/i, '').trim();
        out.push({
          id: node.id,
          label: node.label,
          depth,
          targetId: articleTargetId(num),
          kind: node.kind,
        });
        continue;
      }

      out.push({
        id: node.id,
        label: node.label,
        depth,
        targetId: sectionTargetId(node.id),
        kind: node.kind,
      });

      if (node.children?.length) {
        walk(node.children, depth + 1);
      }
    }
  }

  walk(hierarchy, 0);
  return out;
}

/** Convenience wrapper over a full LawDetail payload. */
export function readingItemsForLaw(law: LawDetail): ReadingItem[] {
  return buildReadingItems({
    hierarchy: law.hierarchy,
    articles: law.articles,
    disposiciones: law.disposiciones,
    rawText: law.rawText,
  });
}
