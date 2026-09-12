import { describe, expect, it } from 'vitest';

import type { Law, LawVersion } from '@/lib/types';

import { FALLBACK_DIFF_LAW_ID, firstProbedDiffLawId, listedDiffCandidate } from './use-diff-example-law';

function law(id: string, versiones: number): Law {
  return {
    id,
    boe: id,
    title: id,
    short: id,
    status: 'vigente',
    rango: 'Ley',
    publicada: '2020-01-01',
    ambito: 'Estatal',
    articulos: 1,
    referencias: 0,
    versiones,
    tags: [],
  };
}

function version(tag: string): LawVersion {
  return { tag, date: '2020-01-01', label: tag, kind: 'publish' };
}

describe('listedDiffCandidate', () => {
  it('returns the first law whose list count is at least 2', () => {
    const candidates = [law('A', 0), law('B', 4), law('C', 3)];
    expect(listedDiffCandidate(candidates)?.id).toBe('B');
  });

  it('returns undefined when every list count is below 2', () => {
    expect(listedDiffCandidate([law('A', 0), law('B', 1)])).toBeUndefined();
  });
});

describe('firstProbedDiffLawId', () => {
  it('skips pending and short timelines, then picks the first success with ≥2 versions', () => {
    const ids = ['A', 'B', 'C'];
    const results = [
      { data: undefined, status: 'pending' },
      { data: [version('v1')], status: 'success' },
      { data: [version('v2'), version('v1')], status: 'success' },
    ];
    expect(firstProbedDiffLawId(ids, results)).toBe('C');
  });

  it('returns undefined when every probe fails or is too short', () => {
    const ids = ['A', 'B'];
    const results = [
      { data: undefined, status: 'error' },
      { data: [version('v1')], status: 'success' },
    ];
    expect(firstProbedDiffLawId(ids, results)).toBeUndefined();
  });

  it('fallback constant stays the mock-rich LOPDGDD id', () => {
    expect(FALLBACK_DIFF_LAW_ID).toBe('BOE-A-2018-16673');
  });
});
