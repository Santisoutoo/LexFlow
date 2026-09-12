import { describe, expect, it } from 'vitest';

import { filterCommands, STATIC_COMMANDS } from './commands';
import type { TranslatedCommandDef } from './commands';

function cmd(over: Partial<TranslatedCommandDef> & { id: TranslatedCommandDef['id'] }): TranslatedCommandDef {
  return { titleKey: 'commandPalette.commands.theme', title: 'Untitled', ...over };
}

const registry: TranslatedCommandDef[] = [
  cmd({ id: 'theme', title: 'Cambiar tema' }),
  cmd({ id: 'go-graph', title: 'Ir al grafo', kbd: 'g g' }),
  cmd({ id: 'go-chat', title: 'Ir al chat', kbd: 'g c' }),
  cmd({ id: 'go-dash', title: 'Cuadros de mando' }),
  cmd({ id: 'export', title: 'Exportar página como PDF' }),
];

describe('filterCommands', () => {
  it('returns all commands when query is empty', () => {
    expect(filterCommands(registry, '')).toHaveLength(registry.length);
  });

  it('treats a non-empty query literally — no trimming (parity with the original filter)', () => {
    expect(filterCommands(registry, '   ')).toEqual([]);
  });

  it('matches case-insensitively', () => {
    const result = filterCommands(registry, 'TEMA');
    expect(result.map((c) => c.id)).toEqual(['theme']);
  });

  it('matches a partial substring', () => {
    const result = filterCommands(registry, 'grafo');
    expect(result.map((c) => c.id)).toEqual(['go-graph']);
  });

  it('returns multiple matches when query spans several titles', () => {
    const result = filterCommands(registry, 'ir');
    expect(result.map((c) => c.id)).toEqual(['go-graph', 'go-chat']);
  });

  it('returns empty array when nothing matches', () => {
    expect(filterCommands(registry, 'zzznomatch')).toHaveLength(0);
  });

  it('does not mutate the input array', () => {
    const original = [...registry];
    filterCommands(registry, 'tema');
    expect(registry).toEqual(original);
  });

  it('matches aliases case-insensitively', () => {
    const withAliases = [
      cmd({ id: 'go-settings', title: 'Ir a ajustes', aliases: ['settings', 'ajustes'] }),
      cmd({ id: 'go-search', title: 'Ir a búsqueda', aliases: ['search', 'buscar'] }),
    ];
    expect(filterCommands(withAliases, 'settings').map((c) => c.id)).toEqual(['go-settings']);
    expect(filterCommands(withAliases, 'BUSCAR').map((c) => c.id)).toEqual(['go-search']);
  });
});

describe('STATIC_COMMANDS', () => {
  it('contains unique ids, title keys, and the Sprint 1 go-to destinations', () => {
    expect(STATIC_COMMANDS).toHaveLength(11);
    const ids = STATIC_COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      'go-home',
      'go-explorer',
      'go-search',
      'go-graph',
      'go-chat',
      'go-dash',
      'go-communities',
      'go-editor',
      'go-settings',
      'theme',
      'export',
    ]);
    for (const c of STATIC_COMMANDS) {
      expect(c.titleKey.trim().length).toBeGreaterThan(0);
    }
  });
});
