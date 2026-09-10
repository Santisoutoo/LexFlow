import { describe, expect, it } from 'vitest';
import {
  expandAliasesInQuery,
  foldForSearch,
  LAW_ALIAS_MAP,
  locateAllTokens,
  matchesAllTokens,
  prepareSearchTokens,
} from './search-match';

describe('search-match', () => {
  it('folds accents for matching', () => {
    expect(foldForSearch('Constitución')).toBe('constitucion');
  });

  it('matches all tokens with AND semantics', () => {
    const tokens = prepareSearchTokens('española constitucion');
    expect(matchesAllTokens('Constitución Española', tokens)).toBe(true);
    expect(matchesAllTokens('Constitución', tokens)).toBe(false);
  });

  it('expands LOPD token-wise', () => {
    const { expandedQuery, aliasExpansions } = expandAliasesInQuery('LOPD sanciones');
    expect(expandedQuery).toContain('protección de datos personales');
    expect(aliasExpansions.some((e) => e.token.toUpperCase() === 'LOPD')).toBe(true);
  });

  it('locates multiple token ranges', () => {
    const tokens = prepareSearchTokens('protección sanciones');
    const ranges = locateAllTokens('Las sanciones en protección de datos', tokens);
    expect(ranges.length).toBeGreaterThanOrEqual(2);
  });

  it('audit queries match expected mock law ids', () => {
    const laws = [
      { id: 'BOE-A-1978-31229', title: 'Constitución Española', text: 'Constitución Española' },
      {
        id: 'BOE-A-2015-11430',
        title: 'Real Decreto Legislativo 2/2015, Estatuto de los Trabajadores',
        text: 'El despido procedente no da derecho a indemnización.',
      },
      {
        id: 'BOE-A-2018-16673',
        title: 'Ley Orgánica 3/2018 de Protección de Datos Personales',
        text: 'Las sanciones por infracciones en materia de protección de datos personales.',
      },
    ];

    const assertHit = (query: string, expectedId: string) => {
      const { expandedQuery } = expandAliasesInQuery(query);
      const tokens = prepareSearchTokens(expandedQuery);
      const hit = laws.find((law) => matchesAllTokens(`${law.title} ${law.text}`, tokens));
      expect(hit?.id).toBe(expectedId);
    };

    assertHit('constitucion española', 'BOE-A-1978-31229');
    assertHit('española constitución', 'BOE-A-1978-31229');
    assertHit('despido indemnización', 'BOE-A-2015-11430');
    assertHit('LOPD sanciones', 'BOE-A-2018-16673');
  });

  it('keeps alias map non-empty', () => {
    expect(Object.keys(LAW_ALIAS_MAP).length).toBeGreaterThanOrEqual(25);
  });
});
