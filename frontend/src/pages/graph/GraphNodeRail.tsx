/**
 * Right-rail metadata block for a selected graph node.
 *
 * Replaces fabricated `graph.kindDesc.*` copy with real law metadata
 * (rank, status, counts, PageRank) when available.
 */
import { useTranslation } from 'react-i18next';

import { RANK_MAP, STATUS_MAP } from '@/lib/api/transformers';
import { useLaw } from '@/lib/queries';
import type { GraphNode } from '@/lib/types';
import { statusLabel } from '@/lib/utils';

interface GraphNodeRailProps {
  node: GraphNode;
  selectedId: string;
}

function RailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-fg">{value}</dd>
    </div>
  );
}

/**
 * Render honest metadata for the node selected in GraphPage's right rail.
 */
export function GraphNodeRail({ node, selectedId }: GraphNodeRailProps) {
  const { t } = useTranslation();
  const { data: law } = useLaw(node.kind === 'law' ? selectedId : undefined);

  if (node.kind === 'article' || node.kind === 'reference' || node.kind === 'amendment') {
    return <p className="mt-1.5 text-[13px] text-muted">{t('graph.rail.genericNode')}</p>;
  }

  if (node.kind === 'repealed') {
    const status = statusLabel(STATUS_MAP[String(node.meta?.status ?? '')] ?? 'pendiente');
    return (
      <dl className="mt-1.5 space-y-1 text-[13px]">
        <RailRow label={t('graph.rail.status')} value={status} />
      </dl>
    );
  }

  const rank = law?.rango ?? RANK_MAP[String(node.meta?.rank ?? '')] ?? 'Otro';
  const status = statusLabel(law?.status ?? STATUS_MAP[String(node.meta?.status ?? '')] ?? 'pendiente');
  const articles = law ? String(law.articulos) : '—';
  const references = law ? String(law.referencias) : '—';
  const pagerank =
    typeof node.meta?.pagerank === 'number' && node.meta.pagerank > 0
      ? node.meta.pagerank.toFixed(3)
      : null;

  return (
    <dl className="mt-1.5 space-y-1 text-[13px]">
      <RailRow label={t('graph.rail.rank')} value={rank} />
      <RailRow label={t('graph.rail.status')} value={status} />
      <RailRow label={t('lawHeader.stats.articles')} value={articles} />
      <RailRow label={t('lawHeader.stats.references')} value={references} />
      {pagerank && <RailRow label={t('graph.rail.pagerank')} value={pagerank} />}
    </dl>
  );
}
