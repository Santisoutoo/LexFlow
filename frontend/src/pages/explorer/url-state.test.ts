import { describe, expect, it } from 'vitest';
import {
  clearedExplorerState,
  defaultExplorerState,
  parseExplorerParams,
  serializeExplorerParams,
  type ExplorerUrlState,
} from './url-state';

function roundTrip(state: ExplorerUrlState): ExplorerUrlState {
  return parseExplorerParams(serializeExplorerParams(state));
}

function expectStateEqual(actual: ExplorerUrlState, expected: ExplorerUrlState): void {
  expect(actual.q).toBe(expected.q);
  expect([...actual.tags].sort()).toEqual([...expected.tags].sort());
  expect([...actual.status].sort()).toEqual([...expected.status].sort());
  expect([...actual.rango].sort()).toEqual([...expected.rango].sort());
  expect([...actual.ambito].sort()).toEqual([...expected.ambito].sort());
  expect(actual.yearFrom).toBe(expected.yearFrom);
  expect(actual.yearTo).toBe(expected.yearTo);
  expect(actual.jurisdiction).toBe(expected.jurisdiction);
  expect(actual.department).toBe(expected.department);
  expect(actual.activeUserTag).toBe(expected.activeUserTag);
  expect(actual.sort).toBe(expected.sort);
}

describe('parseExplorerParams', () => {
  it('re-applies defaults when params are absent', () => {
    expectStateEqual(parseExplorerParams(new URLSearchParams()), defaultExplorerState());
  });

  it('ignores an invalid jurisdiction code', () => {
    const parsed = parseExplorerParams(new URLSearchParams('jurisdiction=xx-nope'));
    expect(parsed.jurisdiction).toBeUndefined();
  });

  it('preserves sort=date', () => {
    const parsed = parseExplorerParams(new URLSearchParams('sort=date'));
    expect(parsed.sort).toBe('date');
  });

  it('treats empty status=/ambito= as cleared, not defaults', () => {
    const parsed = parseExplorerParams(new URLSearchParams('status=&ambito='));
    expect(parsed.status.size).toBe(0);
    expect(parsed.ambito.size).toBe(0);
  });
});

describe('serializeExplorerParams', () => {
  it('omits default status, ambito, and sort', () => {
    const params = serializeExplorerParams(defaultExplorerState());
    expect(params.toString()).toBe('');
  });

  it('writes empty status/ambito for the cleared state', () => {
    const params = serializeExplorerParams(clearedExplorerState());
    expect(params.get('status')).toBe('');
    expect(params.get('ambito')).toBe('');
    expect(params.get('sort')).toBeNull();
  });
});

describe('explorer URL round-trip', () => {
  it('full state survives serialize → parse', () => {
    const full: ExplorerUrlState = {
      q: 'despido',
      tags: new Set(['laboral', 'empleo']),
      status: new Set(['derogada', 'modificada']),
      rango: new Set(['Ley Orgánica']),
      ambito: new Set(['Autonómica']),
      yearFrom: '2018',
      yearTo: '2024',
      jurisdiction: 'es-md',
      department: 'Justicia',
      activeUserTag: 'seguimiento',
      sort: 'date',
    };
    expectStateEqual(roundTrip(full), full);
  });

  it('cleared state survives serialize → parse', () => {
    expectStateEqual(roundTrip(clearedExplorerState()), clearedExplorerState());
  });

  it('default state survives serialize → parse', () => {
    expectStateEqual(roundTrip(defaultExplorerState()), defaultExplorerState());
  });
});
