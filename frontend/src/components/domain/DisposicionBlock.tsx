import { memo } from 'react';
import { cn } from '@/lib/utils';
import { LawMarkdown } from '@/components/domain/LawMarkdown';
import type { ArticleClause, ArticleRef, Disposicion } from '@/lib/types';

export interface DisposicionBlockProps {
  disposicion: Disposicion;
  size?: number;
  serif?: boolean;
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

function DisposicionBlockImpl({ disposicion, size = 16, serif = false, onCitationClick }: DisposicionBlockProps) {
  const heading = disposicion.title
    ? `${disposicion.heading} ${disposicion.title}`
    : disposicion.heading;

  return (
    <article className="relative mb-9">
      <h3 className="mb-2.5 font-display text-[17px] font-semibold">{heading}</h3>
      {disposicion.body.map((clause, i) => (
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
            <sup
              key={ci}
              role="button"
              tabIndex={0}
              onClick={() => onCitationClick?.(c)}
              title={c.label}
              className="cursor-pointer rounded bg-primary-soft px-1 py-0.5 font-mono text-[0.65em] font-semibold text-indigo-600 dark:text-indigo-300"
            >
              {ci + 1}
            </sup>
          ))}
        </div>
      ))}
      {disposicion.refs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {disposicion.refs.map((r, i) => (
            <span
              key={i}
              className={cn(
                'inline-flex items-center gap-1 rounded px-2 py-px font-mono text-[11px]',
                'bg-surface-2 text-muted',
              )}
            >
              {r.label}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

export const DisposicionBlock = memo(DisposicionBlockImpl);
