/**
 * RelatedLaws — compact "Leyes relacionadas" section for the law-detail
 * right rail.
 *
 * Receives the subgraph already fetched by `useGraph(lawId)` and filters it
 * down to neighbour nodes whose `kind === 'law'`, excluding the current law
 * itself. Each item renders as a clickable chip that navigates to the
 * target law's detail page.
 *
 * Responsibilities:
 * - Filter: `kind === 'law'` && `id !== currentLawId`
 * - Cap: at most `MAX_RELATED` items (avoids flooding the right rail when
 *   a very central law has hundreds of law-neighbours)
 * - Empty state: a short muted message when no related laws exist
 * - Loading / unavailable: renders nothing (caller decides whether the
 *   graph is still loading)
 *
 * WHERE TO CHANGE IF X CHANGES:
 * - GraphNode fields → `src/lib/types.ts` `GraphNode` interface
 * - Navigation pattern for law detail → `LawDetailPage.tsx` (currently
 *   `/laws/${encodeURIComponent(id)}`)
 * - `useGraph` return shape → `src/lib/queries.ts` `useGraph`
 */
import { Network } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Chip } from '@/components/ui';
import type { GraphData } from '@/lib/types';
import { EDGE_KIND_LABELS } from '@/lib/graph-colors';
import { resolveRelatedLawNeighbours } from './graph/neighbour-utils';

interface RelatedLawsProps {
  /** Subgraph centred on the current law. Pass `undefined` while loading. */
  graph: GraphData | undefined;
  /** The id of the law currently being viewed — excluded from the list. */
  currentLawId: string;
  /** Navigate to a law detail page. */
  onNavigate: (lawId: string) => void;
}

/**
 * Renders a labelled chip list of laws connected to `currentLawId` in the
 * knowledge graph. Returns `null` when the graph is unavailable.
 *
 * The section only appears when there is at least one related law so the
 * right rail never shows an orphan header.
 */
export function RelatedLaws({ graph, currentLawId, onNavigate }: RelatedLawsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  if (!graph) return null;

  const related = resolveRelatedLawNeighbours(graph, currentLawId);
  const hasInferred = related.some((row) => row.inferred);

  if (related.length === 0) {
    return (
      <div className="mt-5">
        <div className="label-caps mb-2 flex items-center gap-1.5">
          <Network className="size-3 text-muted" aria-hidden />
          {t('graph.relatedLaws.title')}
        </div>
        <p className="text-[12.5px] text-muted">{t('graph.relatedLaws.empty')}</p>
        <p className="mt-1 text-[11.5px] text-muted">{t('graph.relatedLaws.emptyHint')}</p>
        <Button
          size="sm"
          variant="ghost"
          className="mt-2"
          onClick={() => navigate('/graph')}
        >
          {t('graph.relatedLaws.openGraph')}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-5">
      <div className="label-caps mb-2 flex items-center gap-1.5">
        <Network className="size-3 text-muted" aria-hidden />
        {t('graph.relatedLaws.title')}
        <span className="ml-auto text-[11px] font-normal normal-case text-muted">
          {related.length}
        </span>
      </div>
      {hasInferred && (
        <p className="mb-2 text-[11px] font-normal normal-case text-muted">
          {t('graph.relatedLaws.subtitle')}
        </p>
      )}
      <div className="flex flex-col gap-0.5">
        {related.map(({ node, edgeKind, inferred }) => (
          <Chip
            key={node.id}
            onClick={() => onNavigate(node.id)}
            className="w-full justify-start text-left"
          >
            <span className="min-w-0 flex-1 truncate">{node.label}</span>
            <Badge tone="outline">{EDGE_KIND_LABELS[edgeKind]}</Badge>
            {inferred && (
              <span className="text-[10.5px] font-normal text-muted">{t('graph.relatedLaws.inferred')}</span>
            )}
          </Chip>
        ))}
      </div>
    </div>
  );
}
