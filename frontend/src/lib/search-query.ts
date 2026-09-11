/**
 * Parse free-text search input with Obsidian-style inline `#tag` tokens.
 *
 * Inline tags merge with chip-driven tags from the Explorer URL. The last
 * `#fragment` token (if any) is exposed for autocomplete dropdowns.
 */

export interface ParsedSearchInput {
  plainQ: string;
  allTags: Set<string>;
  /** Text after the trailing `#` when the last token starts with `#`; otherwise null. */
  tagFragment: string | null;
}

/** Split `q` into plain text, merged tag set, and optional trailing tag fragment. */
export function parseSearchInput(q: string, chipTags?: Iterable<string>): ParsedSearchInput {
  const tokens = q.split(/\s+/).filter(Boolean);
  const inline = tokens.filter((t) => t.startsWith('#')).map((t) => t.slice(1).toLowerCase());
  const plain = tokens.filter((t) => !t.startsWith('#')).join(' ');
  const allTags = new Set<string>([...(chipTags ?? []), ...inline]);

  const lastToken = tokens.length > 0 ? tokens[tokens.length - 1] : '';
  const tagFragment = lastToken.startsWith('#') ? lastToken.slice(1) : null;

  return { plainQ: plain, allTags, tagFragment };
}
