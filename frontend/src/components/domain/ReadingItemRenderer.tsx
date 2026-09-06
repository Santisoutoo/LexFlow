import { ArticleBlock } from '@/components/domain/ArticleBlock';
import { DisposicionBlock } from '@/components/domain/DisposicionBlock';
import { LawMarkdown } from '@/components/domain/LawMarkdown';
import { SectionHeading } from '@/components/domain/SectionHeading';
import type { ReadingItem } from '@/lib/law-reading';
import type { ArticleRef } from '@/lib/types';
import { cn } from '@/lib/utils';

export interface ReadingItemRendererProps {
  item: ReadingItem;
  index: number;
  readingSize: number;
  readingSerif: boolean;
  highlightedArticleNum?: string | null;
  onRefClick: (ref: ArticleRef) => void;
}

/**
 * Renders a single row in the law reading flow (section, article, etc.).
 */
export function ReadingItemRenderer({
  item,
  index,
  readingSize,
  readingSerif,
  highlightedArticleNum,
  onRefClick,
}: ReadingItemRendererProps) {
  const wrap = (children: React.ReactNode) => (
    <div data-index={index}>
      {children}
    </div>
  );

  if (item.kind === 'section') {
    return wrap(
      <SectionHeading
        node={item.node}
        targetId={item.targetId}
        depth={item.depth}
        size={readingSize}
        serif={readingSerif}
      />,
    );
  }

  if (item.kind === 'article') {
    return wrap(
      <ArticleBlock
        article={item.article}
        size={readingSize}
        serif={readingSerif}
        highlighted={highlightedArticleNum === item.article.num}
        onCitationClick={onRefClick}
      />,
    );
  }

  if (item.kind === 'disposicion') {
    return wrap(
      <DisposicionBlock
        disposicion={item.disposicion}
        size={readingSize}
        serif={readingSerif}
        onCitationClick={onRefClick}
      />,
    );
  }

  return wrap(
    <div
      className={cn('mb-8 text-pretty leading-relaxed', readingSerif && 'font-serif')}
      style={{ fontSize: readingSize, lineHeight: 1.7 }}
    >
      <LawMarkdown>{item.markdown}</LawMarkdown>
    </div>,
  );
}
