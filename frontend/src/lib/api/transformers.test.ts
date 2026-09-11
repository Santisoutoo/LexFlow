/**
 * Tests for `lib/api/transformers.ts` (#90).
 *
 * These are the highest-risk pure functions in the SPA — they convert the
 * backend wire shape (snake_case + Spanish-locale enums) into the camelCase
 * SPA types. A regression here silently corrupts every law/article/diff page.
 *
 * Focus targets:
 *   - `deriveVersionKind` — regex precedence fix from CodeQL alert #1 (#252).
 *   - `transformLaw` — enum maps + short-name builder.
 *   - `parseUnifiedDiffLines` — diff classifier (eq / add / del).
 *   - `listLawsQuery` — pagination + multi → single collapse for filters.
 */

import { describe, expect, it } from 'vitest';
import type { BackendLawDiff, BackendLawDetail, BackendLawSummary, BackendLawVersion, BackendReference } from '../../api';
import {
  listLawsQuery,
  transformArticle,
  transformDiff,
  transformLaw,
  transformLawDetail,
  transformReference,
  transformVersion,
} from './transformers';

// ─── Fixtures ────────────────────────────────────────────────────────────

const lawSummary: BackendLawSummary = {
  identifier: 'BOE-A-2000-323',
  title: 'Ley Orgánica 1/2000, de 7 de enero, de Enjuiciamiento Civil',
  status: 'in_force',
  rank: 'ley_organica',
  scope: 'Estatal',
  jurisdiction: null,
  publication_date: '2000-01-07',
  article_count: 827,
};

const versionRaw: BackendLawVersion = {
  commit_hash: 'abcdef1234567890',
  date: '2024-03-15',
  message: 'feat(law): publish consolidated text of LEC',
  norma: null,
  disposicion: 'LEC consolidada',
  articulos_afectados: ['1', '2', '5'],
};

// ─── deriveVersionKind (via transformVersion) ────────────────────────────

describe('deriveVersionKind', () => {
  const kindOf = (message: string) =>
    transformVersion({ ...versionRaw, message }).kind;

  it('returns publish for messages mentioning publish', () => {
    expect(kindOf('publish initial text')).toBe('publish');
  });

  it('returns publish for messages mentioning public', () => {
    // `consolidate` is checked first in the function so we need a message
    // that contains "public" without "consolid".
    expect(kindOf('public release of LEC')).toBe('publish');
  });

  it('does NOT match "publish" buried inside another word', () => {
    // CodeQL alert #1 regression guard: the fixed regex `\b(publish|public)`
    // requires a word boundary before "publish". Between two word chars
    // (e.g. the `e` and `p` of "republish") there is no `\b`, so the match
    // fails — which is what we want, because "republish" isn't a clean
    // publish event in commit-message taxonomy. The bug we guard against
    // is the OLD pattern `^feat\(publi|public` which had misleading
    // precedence (anchor on the first branch only) and matched any
    // message with the bare substring "public" anywhere.
    expect(kindOf('republish article 5')).toBe('amend');
  });

  it('returns repeal for derog/repeal messages', () => {
    expect(kindOf('derogada por LO 6/2020')).toBe('repeal');
    expect(kindOf('repeal article 3')).toBe('repeal');
  });

  it('returns consolidate for consolidation messages', () => {
    expect(kindOf('consolidate text')).toBe('consolidate');
  });

  it('falls back to amend for unknown messages', () => {
    expect(kindOf('chore: bump deps')).toBe('amend');
  });
});

// ─── transformLaw ────────────────────────────────────────────────────────

describe('transformLaw', () => {
  it('maps backend enums to SPA labels', () => {
    const law = transformLaw(lawSummary);
    expect(law.status).toBe('vigente');
    expect(law.rango).toBe('Ley Orgánica');
    expect(law.ambito).toBe('Estatal');
  });

  it('maps previously-OTRO corpus ranks to their real label (#549)', () => {
    const rangoFor = (rank: string) => transformLaw({ ...lawSummary, rank: rank as BackendLawSummary['rank'] }).rango;
    expect(rangoFor('orden')).toBe('Orden'); // 2.4k laws used to show "Otro"
    expect(rangoFor('resolucion')).toBe('Resolución');
    expect(rangoFor('decreto_ley')).toBe('Decreto-ley');
    expect(rangoFor('ley_foral')).toBe('Ley Foral');
    expect(rangoFor('constitucion')).toBe('Norma constitucional');
  });

  it('uses the BOE identifier as id', () => {
    const law = transformLaw(lawSummary);
    expect(law.id).toBe('BOE-A-2000-323');
    expect(law.boe).toBe('BOE-A-2000-323');
  });

  it('builds a short name from the first clause after the rank prefix', () => {
    // The builder strips "Ley Orgánica 1/2000, de " and then takes the
    // segment up to the next "," or "." — which is "7 de enero" for this
    // title. Documenting current behaviour as a contract; if we ever want
    // the *next* clause ("de Enjuiciamiento Civil") we'd extend the helper
    // and update this expectation.
    const law = transformLaw(lawSummary);
    expect(law.short).toBe('7 de enero');
  });

  it('falls back to identifier when title is just the prefix', () => {
    const law = transformLaw({ ...lawSummary, title: 'Ley Orgánica 1/2000' });
    expect(law.short).toBe('BOE-A-2000-323');
  });

  it('passes through unknown enum values via the fallback', () => {
    // The wire type only declares the known enum members, but the runtime
    // transformer is defensive — assert that an out-of-band value coming
    // from a future backend version still flows through the fallback path.
    const law = transformLaw({
      ...lawSummary,
      status: 'galaxy_brain' as BackendLawSummary['status'],
      rank: 'unknown' as BackendLawSummary['rank'],
    });
    expect(law.status).toBe('pendiente');
    expect(law.rango).toBe('Otro');
  });

  it('treats publication_date as empty string when missing', () => {
    const law = transformLaw({ ...lawSummary, publication_date: null });
    expect(law.publicada).toBe('');
  });

  it('passes the official topic tags through (#671)', () => {
    const law = transformLaw({ ...lawSummary, tags: ['proteccion-de-datos', 'administracion'] });
    expect(law.tags).toEqual(['proteccion-de-datos', 'administracion']);
  });

  it('defaults tags to an empty array when the summary omits them', () => {
    // Older/partial summaries may not carry tags; the chip surfaces must
    // still get a defined array so they render nothing rather than crash.
    expect(transformLaw(lawSummary).tags).toEqual([]);
  });

  it('builds a BOE act.php sourceUrl from the identifier', () => {
    expect(transformLaw(lawSummary).sourceUrl).toBe(
      'https://www.boe.es/buscar/act.php?id=BOE-A-2000-323',
    );
  });
});

// ─── parseUnifiedDiffLines (via transformDiff) ───────────────────────────

describe('parseUnifiedDiffLines (via transformDiff)', () => {
  const baseDiff: BackendLawDiff = {
    law_id: 'BOE-A-2000-323',
    from_commit: 'aaaaaaa1111111',
    to_commit: 'bbbbbbb2222222',
    from_date: '2024-01-01',
    to_date: '2024-06-01',
    diff_text: '',
    stats: { additions: 0, deletions: 0, changed_articles: [] },
  };

  it('classifies + lines as additions and - lines as deletions', () => {
    const result = transformDiff({
      ...baseDiff,
      diff_text: ['+++ b/file', '--- a/file', '@@ -1,2 +1,2 @@', ' kept line', '-removed line', '+added line'].join('\n'),
    });
    const article = result.articles[0];
    const rightAdds = article.right.lines.filter((l) => l.t === 'add');
    const leftDels = article.left.lines.filter((l) => l.t === 'del');
    expect(rightAdds).toHaveLength(1);
    expect(rightAdds[0].s).toBe('added line');
    expect(leftDels).toHaveLength(1);
    expect(leftDels[0].s).toBe('removed line');
  });

  it('classifies " " context lines as equal on both sides', () => {
    const result = transformDiff({
      ...baseDiff,
      diff_text: [' equal line one', ' equal line two'].join('\n'),
    });
    const article = result.articles[0];
    expect(article.left.lines.every((l) => l.t === 'eq')).toBe(true);
    expect(article.right.lines.every((l) => l.t === 'eq')).toBe(true);
  });

  it('skips +++ / --- / @@ / "diff " headers', () => {
    const result = transformDiff({
      ...baseDiff,
      diff_text: ['diff --git a/x b/x', '--- a/x', '+++ b/x', '@@ -1 +1 @@', ' kept'].join('\n'),
    });
    const article = result.articles[0];
    expect(article.left.lines).toHaveLength(1);
    expect(article.left.lines[0].s).toBe('kept');
  });

  it('truncates the commit hash to 7 chars on left/right metadata', () => {
    const result = transformDiff(baseDiff);
    expect(result.from.tag).toBe('aaaaaaa');
    expect(result.to.tag).toBe('bbbbbbb');
  });

  it('falls back to a single Diff completo article when no headings are present', () => {
    const result = transformDiff({
      ...baseDiff,
      diff_text: [' kept line', '-removed', '+added'].join('\n'),
    });
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].num).toBe('todo');
    expect(result.articles[0].titulo).toBe('Diff completo');
  });

  it('segments a multi-article unified diff and keeps per-article totals', () => {
    const result = transformDiff({
      ...baseDiff,
      diff_text: [
        '+++ b/file',
        '--- a/file',
        '@@ -1,3 +1,3 @@',
        '+###### Artículo 1. Objeto.',
        '+Texto nuevo del primero.',
        '@@ -20,4 +20,4 @@',
        ' ###### Artículo 5. Ámbito.',
        '-viejo ámbito',
        '+nuevo ámbito',
      ].join('\n'),
      stats: { additions: 3, deletions: 1, changed_articles: ['1', '5'] },
    });
    expect(result.articles.length).toBeGreaterThan(1);
    expect(result.articles.map((a) => a.num)).toEqual(['1', '5']);
    expect(result.articles[0].titulo).toBe('Objeto');
    expect(result.articles[1].titulo).toBe('Ámbito');
    expect(result.articles[0].totals.added).toBeGreaterThan(0);
    expect(result.articles[1].totals.removed).toBe(1);
    expect(result.totals.modified).toBe(2);
  });
});

// ─── listLawsQuery ───────────────────────────────────────────────────────

describe('listLawsQuery', () => {
  it('defaults to page 1 + page_size 20 when nothing is given', () => {
    const q = listLawsQuery({});
    expect(q.page).toBe(1);
    expect(q.page_size).toBe(20);
  });

  it('uses limit when provided', () => {
    expect(listLawsQuery({ limit: 50 }).page_size).toBe(50);
  });

  it('parses cursor as page number', () => {
    expect(listLawsQuery({ cursor: '3' }).page).toBe(3);
  });

  it('reverse-maps the first rango chip to its backend enum value', () => {
    expect(listLawsQuery({ rango: ['Ley Orgánica'] }).rank).toBe('ley_organica');
  });

  it('reverse-maps a newly-modelled rank so its filter actually sends (#549)', () => {
    expect(listLawsQuery({ rango: ['Orden'] }).rank).toBe('orden');
    expect(listLawsQuery({ rango: ['Resolución'] }).rank).toBe('resolucion');
  });

  it('reverse-maps the first status chip to its backend enum value', () => {
    expect(listLawsQuery({ status: ['vigente'] }).status).toBe('in_force');
  });

  it('reverse-maps the first ambito chip to its backend enum value', () => {
    expect(listLawsQuery({ ambito: ['Estatal'] }).scope).toBe('Estatal');
  });

  it('leaves filters undefined when the chip array is empty', () => {
    const q = listLawsQuery({ rango: [], status: [], ambito: [] });
    expect(q.rank).toBeUndefined();
    expect(q.status).toBeUndefined();
    expect(q.scope).toBeUndefined();
  });

  it('passes the publication-year range straight through (#563)', () => {
    const q = listLawsQuery({ yearFrom: 2018, yearTo: 2024 });
    expect(q.year_from).toBe(2018);
    expect(q.year_to).toBe(2024);
  });

  it('sends the tag set for server-side AND-filtering (#671)', () => {
    // qs() serialises the array as repeated ?tags=a&tags=b downstream.
    expect(listLawsQuery({ tags: ['vivienda', 'andalucia'] }).tags).toEqual(['vivienda', 'andalucia']);
    expect(listLawsQuery({}).tags).toBeUndefined();
  });

    it('sends every active filter together — none is dropped when combined', () => {
    const q = listLawsQuery({
      rango: ['Ley Orgánica'],
      status: ['vigente'],
      ambito: ['Autonómica'],
      yearFrom: 2020,
      yearTo: 2024,
      cursor: '2',
      limit: 30,
    });
    expect(q).toMatchObject({
      rank: 'ley_organica',
      status: 'in_force',
      scope: 'Autonómico', // SCOPE_MAP key for the 'Autonómica' chip
      year_from: 2020,
      year_to: 2024,
      page: 2,
      page_size: 30,
    });
  });

  it('sends sort=date and sort=title to the backend', () => {
    expect(listLawsQuery({ sort: 'date' }).sort).toBe('date');
    expect(listLawsQuery({ sort: 'title' }).sort).toBe('title');
  });

  it('omits relevance and refs (refs is client-only)', () => {
    expect(listLawsQuery({ sort: 'relevance' }).sort).toBeUndefined();
    expect(listLawsQuery({ sort: 'refs' }).sort).toBeUndefined();
    expect(listLawsQuery({}).sort).toBeUndefined();
  });
});

describe('transformArticle', () => {
  it('maps backend blocks to multi-element body clauses', () => {
    const article = transformArticle('BOE-A-2015-10565', {
      number: '4',
      title: 'Concepto de interesado',
      text: '1. First.\n\na) Letter one.',
      blocks: [
        { marker: '1', depth: 0, text: 'First.' },
        { marker: 'a', depth: 1, text: 'Letter one.' },
      ],
      references: [],
    });
    expect(article.body).toHaveLength(2);
    expect(article.body[0]).toMatchObject({ marker: '1', depth: 0, text: 'First.' });
    expect(article.body[1]).toMatchObject({ marker: 'a', depth: 1, text: 'Letter one.' });
  });

  it('distributes citations onto the clause whose text contains the label', () => {
    const article = transformArticle('BOE-A-2018-16673', {
      number: '18',
      title: 'Citas',
      text: 'Cita la LO 3/2018. También el art. 96 CE.',
      blocks: [
        { marker: '1', depth: 0, text: 'Cita la LO 3/2018 en este apartado.' },
        { marker: '2', depth: 0, text: 'También el art. 96 CE aquí.' },
      ],
      references: [
        { target_text: 'LO 3/2018', target_id: 'BOE-A-2018-16673', kind: 'cites', source_article: '18' },
        { target_text: 'art. 96 CE', target_id: 'CE-1978', kind: 'modifies', source_article: '18' },
      ],
    });
    expect(article.body[0].citations.map((c) => c.label)).toEqual(['LO 3/2018']);
    expect(article.body[1].citations.map((c) => c.label)).toEqual(['art. 96 CE']);
    expect(article.body[1].citations[0].relationKind).toBe('modifies');
  });
});

describe('transformReference', () => {
  it('maps kind and source_article onto relationKind / sourceArticle', () => {
    const raw: BackendReference = {
      target_text: 'Ley 15/2022',
      target_id: 'BOE-A-2022-11589',
      kind: 'repeals',
      source_article: '12',
    };
    const ref = transformReference(raw);
    expect(ref).toMatchObject({
      label: 'Ley 15/2022',
      target: { lawId: 'BOE-A-2022-11589' },
      kind: 'law',
      sourceArticle: '12',
      relationKind: 'repeals',
      inferred: false,
    });
  });

  it('marks unresolved targets as inferred and uses the fallback source article', () => {
    const raw: BackendReference = {
      target_text: 'alguna norma',
      target_id: null,
      kind: 'cites',
    };
    const ref = transformReference(raw, '4');
    expect(ref.inferred).toBe(true);
    expect(ref.target).toBeUndefined();
    expect(ref.kind).toBeUndefined();
    expect(ref.sourceArticle).toBe('4');
    expect(ref.relationKind).toBe('cites');
  });
});

describe('transformLawDetail', () => {
  const detailRaw: BackendLawDetail = {
    metadata: {
      identifier: 'BOE-A-1962-14073',
      title: 'Anexo test',
      status: 'in_force',
      rank: 'ley',
      scope: 'Estatal',
      jurisdiction: null,
      publication_date: '1962-01-01',
      tags: [],
      consolidation_status: 'unknown',
      country: 'ES',
    },
    sections: [
      {
        level: 1,
        heading: 'ANEXO',
        text: 'Table prose here',
        subsections: [],
        articles: [],
      },
    ],
    articles: [],
    disposiciones: [],
    references: [],
    article_count: 0,
    raw_text: 'Full raw fallback',
  };

  it('preserves section text in hierarchy nodes', () => {
    const law = transformLawDetail(detailRaw);
    expect(law.hierarchy[0].text).toBe('Table prose here');
  });

  it('maps raw_text to rawText', () => {
    const law = transformLawDetail(detailRaw);
    expect(law.rawText).toBe('Full raw fallback');
  });

  it('maps last_updated and source onto ultimaModificacion / sourceUrl', () => {
    const law = transformLawDetail({
      ...detailRaw,
      metadata: {
        ...detailRaw.metadata,
        last_updated: '2024-03-05',
        source: 'https://www.boe.es/buscar/act.php?id=BOE-A-1962-14073',
      },
    });
    expect(law.ultimaModificacion).toBe('2024-03-05');
    expect(law.sourceUrl).toBe('https://www.boe.es/buscar/act.php?id=BOE-A-1962-14073');
  });

  it('falls back to the BOE act.php URL when metadata.source is missing', () => {
    const law = transformLawDetail(detailRaw);
    expect(law.sourceUrl).toBe('https://www.boe.es/buscar/act.php?id=BOE-A-1962-14073');
    expect(law.ultimaModificacion).toBeUndefined();
  });
});
