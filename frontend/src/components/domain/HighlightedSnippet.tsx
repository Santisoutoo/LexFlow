import { cn } from '@/lib/utils';

export interface HighlightRange {
  start: number;
  end: number;
}

export interface HighlightedSnippetProps {
  /** The snippet text to render. */
  text: string;
  /**
   * Character offsets of the match within `text`. Accepts a single range or
   * multiple ranges for multi-token queries (#47).
   */
  match?: HighlightRange | HighlightRange[] | null;
  /** Optional prefix (e.g. `Art. 28 — `). Never highlighted. */
  prefix?: string;
  className?: string;
}

function normalizeRanges(
  text: string,
  match?: HighlightRange | HighlightRange[] | null,
): HighlightRange[] {
  if (!match) return [];
  const ranges = Array.isArray(match) ? match : [match];
  return ranges.filter(
    (range) => range.end > range.start && range.start >= 0 && range.end <= text.length,
  );
}

/**
 * Render a search-result snippet with matched substrings wrapped in `<mark>`.
 * Falls back to plain text when no valid offsets are available.
 */
export function HighlightedSnippet({ text, match, prefix, className }: HighlightedSnippetProps) {
  const ranges = normalizeRanges(text, match);

  if (ranges.length === 0) {
    return (
      <span className={className}>
        {prefix}
        {text}
      </span>
    );
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start > cursor) {
      parts.push(text.slice(cursor, range.start));
    }
    parts.push(
      <mark
        key={`${range.start}-${range.end}-${index}`}
        className={cn('rounded-sm bg-amber-200/70 px-0.5 text-fg dark:bg-amber-400/30')}
      >
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });
  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return (
    <span className={className}>
      {prefix}
      {parts}
    </span>
  );
}
