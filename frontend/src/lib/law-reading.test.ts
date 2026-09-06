import { describe, expect, it } from 'vitest';
import {
  buildReadingItems,
  flattenToc,
  parseArticleHash,
  sectionTargetId,
} from './law-reading';
import type { Article, Disposicion, HierarchyNode } from './types';

const article = (num: string): Article => ({
  id: `LAW::${num}`,
  lawId: 'LAW',
  num,
  titulo: `Title ${num}`,
  body: [{ marker: null, text: `Body ${num}`, depth: 0, citations: [] }],
  refs: [],
});

const hierarchy: HierarchyNode[] = [
  {
    id: 'root-0::2-TÍTULO I',
    kind: 'titulo',
    label: 'TÍTULO I',
    heading: 'TÍTULO I',
    children: [
      {
        id: 'root-0::2-TÍTULO I::art-14',
        kind: 'articulo',
        label: 'Art. 14',
      },
      {
        id: 'root-0::2-TÍTULO I::3-CAPÍTULO I',
        kind: 'capitulo',
        label: 'CAPÍTULO I',
        heading: 'CAPÍTULO I',
        children: [
          {
            id: 'root-0::2-TÍTULO I::3-CAPÍTULO I::art-15',
            kind: 'articulo',
            label: 'Art. 15',
          },
        ],
      },
    ],
  },
];

describe('parseArticleHash', () => {
  it('extracts article number from hash', () => {
    expect(parseArticleHash('#art-14')).toBe('14');
    expect(parseArticleHash('#art-28.3')).toBe('28.3');
    expect(parseArticleHash(`#art-${encodeURIComponent('28.3')}`)).toBe('28.3');
  });

  it('returns null for non-article hashes', () => {
    expect(parseArticleHash('#section-foo')).toBeNull();
    expect(parseArticleHash('')).toBeNull();
  });
});

describe('buildReadingItems', () => {
  it('walks hierarchy and resolves articles', () => {
    const items = buildReadingItems({
      hierarchy,
      articles: [article('14'), article('15'), article('99')],
      disposiciones: [],
    });
    const kinds = items.map((i) => i.kind);
    expect(kinds).toContain('section');
    expect(kinds).toContain('article');
    expect(items.filter((i) => i.kind === 'article').map((i) => i.article.num)).toEqual(['14', '15', '99']);
  });

  it('uses section prose for zero-article laws', () => {
    const proseHierarchy: HierarchyNode[] = [
      {
        id: 'root-0::1-PREÁMBULO',
        kind: 'titulo',
        label: 'PREÁMBULO',
        heading: 'PREÁMBULO',
        text: 'Preámbulo text',
      },
    ];
    const items = buildReadingItems({
      hierarchy: proseHierarchy,
      articles: [],
      disposiciones: [],
    });
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('section');
    if (items[0].kind === 'section') {
      expect(items[0].node.text).toBe('Preámbulo text');
    }
  });

  it('falls back to raw text when no hierarchy or articles', () => {
    const items = buildReadingItems({
      hierarchy: [],
      articles: [],
      disposiciones: [],
      rawText: '# Raw body',
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({ kind: 'raw', markdown: '# Raw body' });
  });

  it('appends disposiciones at the end', () => {
    const disposicion: Disposicion = {
      heading: 'Disposición final',
      kind: 'final',
      number: null,
      title: null,
      text: 'Final text',
      body: [{ marker: null, text: 'Final text', depth: 0, citations: [] }],
      refs: [],
    };
    const items = buildReadingItems({
      hierarchy: [],
      articles: [article('1')],
      disposiciones: [disposicion],
    });
    expect(items[items.length - 1]).toEqual({ kind: 'disposicion', disposicion });
  });
});

describe('flattenToc', () => {
  it('produces nested toc entries with target ids', () => {
    const toc = flattenToc(hierarchy);
    expect(toc[0].label).toBe('TÍTULO I');
    expect(toc[0].targetId).toBe(sectionTargetId('root-0::2-TÍTULO I'));
    expect(toc.some((e) => e.kind === 'articulo' && e.targetId === 'art-14')).toBe(true);
  });
});
