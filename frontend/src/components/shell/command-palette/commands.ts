/**
 * Static command registry and query filter for the CommandPalette.
 *
 * Extracted from `CommandPalette` to shrink that god component and make
 * command definitions unit-testable (#556).
 *
 * Deliberately free of React and closures: a `CommandDef` carries only
 * plain data (id, titleKey, optional kbd hint, optional aliases). Icons
 * and `run` callbacks are wired up inside `CommandPalette` after filtering
 * so this module stays fully testable without a DOM.
 *
 * WHERE TO CHANGE IF X CHANGES: when a new Comando is added, append an
 * entry to `STATIC_COMMANDS`. The icon and `run` callback must be added in
 * the corresponding block inside `CommandPalette.tsx`.
 */

/** Identifier for each static command. Used as the React key and lookup. */
export type CommandId =
  | 'go-home'
  | 'go-explorer'
  | 'go-search'
  | 'go-graph'
  | 'go-chat'
  | 'go-dash'
  | 'go-communities'
  | 'go-editor'
  | 'go-settings'
  | 'theme'
  | 'export';

/** Plain-data descriptor for a static palette command (no React, no closures). */
export interface CommandDef {
  /** Stable identifier; doubles as the React list key. */
  id: CommandId;
  /** i18n key under `commandPalette.commands.*`. */
  titleKey: string;
  /** Optional keyboard shortcut hint displayed next to the row. */
  kbd?: string;
  /** Extra EN/ES synonyms matched by `filterCommands` (case-insensitive). */
  aliases?: string[];
}

/** Command row with a resolved display title (for filtering and rendering). */
export interface TranslatedCommandDef extends CommandDef {
  title: string;
}

/**
 * All static commands available in the palette, in display order.
 *
 * Navigation first (overflow for the capped 5-tab mobile bar), then
 * utilities. Icons and `run` callbacks are added by `CommandPalette`.
 */
export const STATIC_COMMANDS: CommandDef[] = [
  { id: 'go-home', titleKey: 'commandPalette.commands.goHome', kbd: 'g h', aliases: ['home', 'inicio'] },
  { id: 'go-explorer', titleKey: 'commandPalette.commands.goExplorer', kbd: 'g e', aliases: ['explorer', 'explorador'] },
  { id: 'go-search', titleKey: 'commandPalette.commands.goSearch', aliases: ['search', 'buscar'] },
  { id: 'go-graph', titleKey: 'commandPalette.commands.goGraph', kbd: 'g g' },
  { id: 'go-chat', titleKey: 'commandPalette.commands.goChat', kbd: 'g c' },
  { id: 'go-dash', titleKey: 'commandPalette.commands.goDash', kbd: 'g d' },
  { id: 'go-communities', titleKey: 'commandPalette.commands.goCommunities', aliases: ['communities', 'comunidades'] },
  { id: 'go-editor', titleKey: 'commandPalette.commands.goEditor', kbd: 'g n', aliases: ['editor'] },
  { id: 'go-settings', titleKey: 'commandPalette.commands.goSettings', kbd: 'g s', aliases: ['settings', 'ajustes'] },
  { id: 'theme', titleKey: 'commandPalette.commands.theme', kbd: '⌘ .' },
  { id: 'export', titleKey: 'commandPalette.commands.export' },
];

function commandMatches(command: TranslatedCommandDef, needle: string): boolean {
  if (command.title.toLowerCase().includes(needle)) return true;
  return (command.aliases ?? []).some((alias) => alias.toLowerCase().includes(needle));
}

/**
 * Filter `commands` by `query`, case-insensitively matching against `title`
 * or any `aliases` entry.
 *
 * Returns the full list unchanged when `query` is empty, mirroring the
 * original inline filter (``!q || title.includes(q)``) exactly — the raw
 * query is matched as-is, with no trimming, so behaviour is preserved.
 */
export function filterCommands(commands: TranslatedCommandDef[], query: string): TranslatedCommandDef[] {
  if (!query) return commands;
  const needle = query.toLowerCase();
  return commands.filter((c) => commandMatches(c, needle));
}
