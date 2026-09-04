/**
 * Inline SVG swatches matching `paintNode` shapes for toolbar chips (#24).
 */
import type { GraphNodeKind } from '@/lib/types';

function KindShapeSwatch({ kind }: { kind: GraphNodeKind }) {
  switch (kind) {
    case 'law':
      return <circle cx="6" cy="6" r="4" fill="currentColor" />;
    case 'article':
      return (
        <circle cx="6" cy="6" r="3.5" fill="currentColor" stroke="currentColor" strokeWidth="1.5" opacity="0.85" />
      );
    case 'reference':
      return <polygon points="6,2 10,6 6,10 2,6" fill="currentColor" />;
    case 'amendment':
      return <polygon points="6,2 10,9 2,9" fill="currentColor" />;
    case 'repealed':
      return (
        <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.5" />
      );
    default:
      return <circle cx="6" cy="6" r="4" fill="currentColor" />;
  }
}

/** Wrapper SVG for chip icon size. */
export function KindShapeIcon({ kind }: { kind: GraphNodeKind }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="text-fg">
      <KindShapeSwatch kind={kind} />
    </svg>
  );
}
