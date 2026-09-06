import { LawMarkdown } from '@/components/domain/LawMarkdown';
import type { HierarchyNode } from '@/lib/types';
import { cn } from '@/lib/utils';

const LEVEL_TAG: Record<number, keyof JSX.IntrinsicElements> = {
  0: 'h2',
  1: 'h3',
  2: 'h4',
  3: 'h4',
};

export interface SectionHeadingProps {
  node: HierarchyNode;
  targetId: string;
  depth: number;
  size?: number;
  serif?: boolean;
}

/**
 * Hierarchy section heading plus optional prose block (preámbulo, anexo).
 */
export function SectionHeading({ node, targetId, depth, size = 16, serif = false }: SectionHeadingProps) {
  const Tag = LEVEL_TAG[Math.min(depth, 3)] ?? 'h4';
  const headingText = node.heading ?? node.label;

  return (
    <section className="mb-8 scroll-mt-6">
      <Tag
        id={targetId}
        className={cn(
          'font-display font-semibold text-fg',
          depth === 0 && 'text-xl',
          depth === 1 && 'text-lg',
          depth >= 2 && 'text-base',
        )}
      >
        {headingText}
      </Tag>
      {node.text ? (
        <div
          className={cn('mt-3 text-pretty leading-relaxed', serif && 'font-serif')}
          style={{ fontSize: size, lineHeight: 1.7 }}
        >
          <LawMarkdown>{node.text}</LawMarkdown>
        </div>
      ) : null}
    </section>
  );
}
