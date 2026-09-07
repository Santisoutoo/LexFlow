/**
 * Static command registry and query filter for the CommandPalette.
 *
 * Extracted from `CommandPalette` to shrink that god component and make
 * command definitions unit-testable (#556).
 *
 * Deliberately free of React and closures: a `CommandDef` carries only
 * plain data (id, titleKey, optional kbd hint). Icons and `run` callbacks are
 * wired up inside `CommandPalette` after filtering so this module stays
 * fully testable without a DOM.
 *
 * WHERE TO CHANGE IF X CHANGES: when a new Comando is added, append an
 * entry to `STATIC_COMMANDS`. The icon and `run` callback must be added in
 * the corresponding block inside `CommandPalette.tsx`.
 */

/** Identifier for each static command. Used as the React key and lookup. */
export type CommandId = 'theme' | 'go-graph' | 'go-chat' | 'go-dash' | 'export';

/** Plain-data descriptor for a static palette command (no React, no closures). */
export interface CommandDef {
  /** Stable identifier; doubles as the React list key. */
  id: CommandId;
  /** i18n key under `commandPalette.commands.*`. */
  titleKey: string;
  /** Optional keyboard shortcut hint displayed next to the row. */
  kbd?: string;
}

/** Command row with a resolved display title (for filtering and rendering). */
export interface TranslatedCommandDef extends CommandDef {
  title: string;
}

/**
 * All static commands available in the palette, in display order.
 *
 * Each entry is a plain-data record — icons and `run` callbacks are added
 * by `CommandPalette` after filtering.
 */
export const STATIC_COMMANDS: CommandDef[] = [
  { id: 'theme', titleKey: 'commandPalette.commands.theme', kbd: '⌘ .' },
  { id: 'go-graph', titleKey: 'commandPalette.commands.goGraph', kbd: 'g g' },
  { id: 'go-chat', titleKey: 'commandPalette.commands.goChat', kbd: 'g c' },
  { id: 'go-dash', titleKey: 'commandPalette.commands.goDash', kbd: 'g d' },
  { id: 'export', titleKey: 'commandPalette.commands.export' },
];

/**
 * Filter `commands` by `query`, case-insensitively matching against `title`.
 *
 * Returns the full list unchanged when `query` is empty, mirroring the
 * original inline filter (``!q || title.includes(q)``) exactly — the raw
 * query is matched as-is, with no trimming, so behaviour is preserved.
 */
export function filterCommands(commands: TranslatedCommandDef[], query: string): TranslatedCommandDef[] {
  if (!query) return commands;
  const needle = query.toLowerCase();
  return commands.filter((c) => c.title.toLowerCase().includes(needle));
}
