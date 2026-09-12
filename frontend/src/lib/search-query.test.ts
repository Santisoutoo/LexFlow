import { describe, expect, it } from 'vitest';
import { parseSearchInput, parseSearchMode, searchResultsHref } from './search-query';

describe('parseSearchInput', () => {
  it('extracts inline tags and plain query', () => {
    const { plainQ, allTags, tagFragment } = parseSearchInput('#laboral despido');
    expect(plainQ).toBe('despido');
    expect(allTags).toEqual(new Set(['laboral']));
    expect(tagFragment).toBeNull();
  });

  it('merges chip tags with inline tags', () => {
    const { allTags } = parseSearchInput('#laboral foo', ['penal']);
    expect(allTags).toEqual(new Set(['penal', 'laboral']));
  });

  it('exposes trailing tag fragment for autocomplete', () => {
    const { tagFragment } = parseSearchInput('foo #lab');
    expect(tagFragment).toBe('lab');
  });

  it('exposes empty fragment when input ends with bare #', () => {
    const { tagFragment } = parseSearchInput('foo #');
    expect(tagFragment).toBe('');
  });
});

describe('searchResultsHref', () => {
  it('preserves #tag tokens in q', () => {
    expect(searchResultsHref('#laboral despido')).toBe('/search?q=%23laboral+despido');
  });

  it('appends mode when provided', () => {
    expect(searchResultsHref('ley', 'hybrid')).toBe('/search?q=ley&mode=hybrid');
  });
});

describe('parseSearchMode', () => {
  it('defaults unknown values to fulltext', () => {
    expect(parseSearchMode(null)).toBe('fulltext');
    expect(parseSearchMode('nope')).toBe('fulltext');
    expect(parseSearchMode('semantic')).toBe('semantic');
  });
});
