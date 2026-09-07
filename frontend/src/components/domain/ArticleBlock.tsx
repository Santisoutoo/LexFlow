import { memo } from 'react';
import { cn } from '@/lib/utils';
import { LawMarkdown } from '@/components/domain/LawMarkdown';
import type { Article, ArticleClause, ArticleRef } from '@/lib/types';

export interface ArticleBlockProps {
  article: Article;
  /** Override the reading font-size from a parent (sync'd to the Tweaks slider). */
  size?: number;
  /** Optional serif reading face. */
  serif?: boolean;
  /** Temporary highlight for deep-link navigation from search. */
  highlighted?: boolean;
  /** Called when a footnote reference is clicked. */
  onCitationClick?: (ref: ArticleRef) => void;
}

function clauseIndent(depth: number | undefined): string {
  if (depth === 1) return 'ml-6';
  if (depth === 2) return 'ml-10';
  return 'ml-0';
}

function formatMarker(marker: string, depth: number | undefined): string {
  if ((depth ?? 0) >= 1) return `${marker})`;
  return `${marker}.`;
}

function clauseKey(clause: ArticleClause, index: number): string {
  return `${clause.marker ?? 'p'}-${clause.depth ?? 0}-${index}`;
}

/**
 * Single article rendered with number in the gutter, body in the reading
 * column, and citations as superscripts on the clause they belong to.
 *
 * Audit #409 perf: wrapped with ``React.memo`` so the LawDetailPage's
 * "texto" tab — which can list dozens of articles — does not re-render
 * every block when the reading-size slider moves the parent. Pass a
 * stable ``onCitationClick`` (e.g. ``useCallback``) to preserve the
 * memoisation across renders.
 */
function ArticleBlockImpl({ article, size = 16, serif = false, highlighted = false, onCitationClick }: ArticleBlockProps) {
  return (
    <article
      id={`art-${article.num}`}
      className={cn(
        'relative mb-9 scroll-mt-6 rounded-lg transition-colors duration-300',
        highlighted && 'ring-2 ring-amber-400/80 bg-amber-200/30 dark:bg-amber-400/15',
      )}
    >
      <div className="absolute left-[-80px] top-1 hidden w-[4.5rem] pl-1 text-right md:block">
        <div className="whitespace-nowrap font-mono text-[13px] font-semibold text-amber-700 dark:text-amber-400">
          Art. {article.num}
        </div>
      </div>
      {article.titulo ? (
        <h3 className="mb-2.5 font-display text-[17px] font-semibold">{article.titulo}</h3>
      ) : null}
      {article.body.map((clause, i) => (
        // <div> (not <p>): clause.text is Markdown that may render block
        // elements (headings, GFM tables) which are invalid inside <p> (#591).
        <div
          key={clauseKey(clause, i)}
          className={cn(
            'mb-3 text-pretty leading-relaxed',
            clauseIndent(clause.depth),
            serif && 'font-serif',
          )}
          style={{ fontSize: size, lineHeight: 1.7 }}
        >
          {clause.marker ? (
            <span className="font-semibold mr-1">{formatMarker(clause.marker, clause.depth)}</span>
          ) : null}
          <LawMarkdown>{clause.text}</LawMarkdown>
          {clause.citations.map((c, ci) => (
            <CitationSup key={ci} index={ci + 1} ref_={c} onClick={() => onCitationClick?.(c)} />
          ))}
        </div>
      ))}
    </article>
  );
}

export const ArticleBlock = memo(ArticleBlockImpl);

function CitationSup({ index, ref_, onClick }: { index: number; ref_: ArticleRef; onClick?: () => void }) {
  return (
    <sup
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        // Audit #409 — WAI-ARIA `button` role must respond to both
        // Enter and Space; ``preventDefault`` stops Space from
        // scrolling the page.
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      title={ref_.label}
      className={cn(
        'cursor-pointer rounded bg-primary-soft px-1 py-0.5 font-mono text-[0.65em] font-semibold text-indigo-600 dark:text-indigo-300',
        'hover:bg-indigo-200 dark:hover:bg-indigo-800',
      )}
    >
      {index}
    </sup>
  );
}
