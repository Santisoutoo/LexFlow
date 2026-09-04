import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Plus, Minus, Filter, Download, Pin, X, Maximize2 } from 'lucide-react';
import { Badge, Button, Chip, Input } from '@/components/ui';
import { KindShapeIcon } from '@/components/domain/KindShapeIcon';
import { GraphCanvasLazy } from '@/components/domain/GraphCanvasLazy';
import type { GraphCanvasHandle } from '@/components/domain/GraphCanvas';
import { EmptyState } from '@/components/domain/EmptyState';
import { ErrorState } from '@/components/domain/ErrorState';
import { SkeletonCanvas } from '@/components/domain/Skeleton';
import { RightRail } from '@/components/shell/RightRail';
import { useGraph, useGraphTop, useWarmup } from '@/lib/queries';
import {
  EDGE_KIND_LABELS,
  GRAPH_EDGE_STROKE,
  NODE_KIND_LABELS,
  resolveCommunityFill,
} from '@/lib/graph-colors';
import { useGraphPins } from '@/lib/graph-pins';
import type { GraphNodeKind } from '@/lib/types';
import { cn } from '@/lib/utils';
import { buildNodeIndex, resolveNeighbourNodes } from './graph/neighbour-utils';
import { deriveLegendCommunities, deriveLegendEdgeKinds, deriveLegendNodeKinds } from './graph/legend-utils';
import {
  GraphFilterPopover,
  type GraphAdvancedFilters,
} from './graph/GraphFilterPopover';
import { intersectMatchSets, resolveAdvancedFilterMatches } from './graph/graph-filter-utils';
import { GraphNodeRail } from './graph/GraphNodeRail';

const ALL_KINDS: GraphNodeKind[] = ['law', 'article', 'reference', 'amendment', 'repealed'];

// Fallback seed when the live `/graph/top` call isn't available (mock
// mode without a seeded mock, transient network failure, empty corpus).
// "BOE-A-1978-31229" is the Constitución Española de 1978 — guaranteed
// to be in any legalize-es checkout.
const FALLBACK_SEED_LAW_ID = 'BOE-A-1978-31229';

const EMPTY_ADVANCED_FILTERS: GraphAdvancedFilters = { status: new Set(), rank: new Set() };

export function GraphPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation();
  const [filters, setFilters] = useState<Set<GraphNodeKind>>(new Set(ALL_KINDS));
  const [searchQuery, setSearchQuery] = useState('');
  const [advancedFilters, setAdvancedFilters] = useState<GraphAdvancedFilters>(EMPTY_ADVANCED_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const graphRef = useRef<GraphCanvasHandle>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const { pinnedLawIds, togglePin, isPinned } = useGraphPins();
  const { data: topLaws } = useGraphTop({ limit: 10 });
  const [manualSeed, setManualSeed] = useState<string | null>(null);
  const urlLaw = searchParams.get('law');
  const seedLawId = manualSeed ?? urlLaw ?? topLaws?.[0]?.lawId ?? FALLBACK_SEED_LAW_ID;

  const pickSeed = useCallback(
    (lawId: string) => {
      setManualSeed(lawId);
      const next = new URLSearchParams(searchParams);
      next.set('law', lawId);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (selected === null && seedLawId) setSelected(seedLawId);
  }, [seedLawId, selected]);
  const { data: graph, error, refetch, isLoading } = useGraph(seedLawId);

  const toggle = useCallback((kind: GraphNodeKind) => {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }, []);

  const { data: warmup } = useWarmup();

  const nodeById = useMemo(() => buildNodeIndex(graph?.nodes ?? []), [graph?.nodes]);
  const neighbours = useMemo(
    () => resolveNeighbourNodes(graph?.edges ?? [], nodeById, selected),
    [graph?.edges, nodeById, selected],
  );
  const node = selected ? nodeById.get(selected) ?? null : null;

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !graph) return null;
    return new Set(
      graph.nodes
        .filter((n) => n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q))
        .map((n) => n.id),
    );
  }, [graph, searchQuery]);

  const advancedMatches = useMemo(
    () => (graph ? resolveAdvancedFilterMatches(graph.nodes, advancedFilters) : null),
    [graph, advancedFilters],
  );

  const matchNodeIds = useMemo(
    () => intersectMatchSets(searchMatches, advancedMatches),
    [searchMatches, advancedMatches],
  );

  const legendCommunities = useMemo(() => (graph ? deriveLegendCommunities(graph) : []), [graph]);
  const legendEdgeKinds = useMemo(() => (graph ? deriveLegendEdgeKinds(graph) : []), [graph]);
  const legendNodeKinds = useMemo(() => (graph ? deriveLegendNodeKinds(graph) : []), [graph]);

  const handleSearchKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter' || !graph) return;
      const q = searchQuery.trim().toLowerCase();
      if (!q) return;
      const first = graph.nodes.find((n) => n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q));
      if (!first) return;
      setSelected(first.id);
      graphRef.current?.centerAt(first.id);
    },
    [graph, searchQuery],
  );

  if (error) {
    const suggestions = topLaws ?? [];
    if (suggestions.length === 0) {
      return (
        <div className="p-10">
          <ErrorState onRetry={() => refetch()} description={String(error)} />
        </div>
      );
    }
    return (
      <div className="p-10">
        <EmptyState
          title={t('graph.error.title')}
          description={
            <>
              <span className="block">{t('graph.error.seedMissing', { seed: seedLawId })}</span>
              <span className="mt-1 block">{t('graph.error.trySuggestions')}</span>
            </>
          }
          primaryAction={{ label: t('graph.retry'), onClick: () => refetch() }}
        />
        <div className="mx-auto mt-5 flex max-w-2xl flex-wrap justify-center gap-2">
          {suggestions.map((law) => (
            <button
              key={law.lawId}
              type="button"
              onClick={() => pickSeed(law.lawId)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[12.5px] hover:border-indigo-500/60 hover:bg-primary-soft/40"
            >
              <span className="font-mono text-[11px] text-muted">{law.lawId}</span>
              {law.title && <span className="max-w-[18ch] truncate">{law.title}</span>}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (!graph || isLoading) {
    const hint = warmup && !warmup.graphReady ? t('graph.buildingFirstTime') : t('graph.loading');
    return (
      <div className="h-full p-6">
        <SkeletonCanvas hint={hint} />
      </div>
    );
  }

  const communityId = typeof node?.meta?.community === 'number' ? node.meta.community : 0;
  const badgeFill = resolveCommunityFill(communityId);

  return (
    <div className="flex h-full min-h-0">
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2.5 overflow-x-auto border-b border-border bg-bg px-4 py-2.5 md:flex-wrap md:overflow-visible">
          <Input
            icon={<Search className="size-3.5" />}
            placeholder={t('graph.searchPlaceholder')}
            aria-label={t('graph.searchPlaceholder')}
            className="hidden w-72 md:inline-flex"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          <span className="hidden h-6 w-px bg-border md:block" />
          {ALL_KINDS.map((kind) => (
            <Chip
              key={kind}
              active={filters.has(kind)}
              onClick={() => toggle(kind)}
              title={t('graph.filterDimHint')}
              icon={<KindShapeIcon kind={kind} />}
            >
              {NODE_KIND_LABELS[kind]}
            </Chip>
          ))}
          {pinnedLawIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {pinnedLawIds.map((lawId) => {
                const pinnedNode = nodeById.get(lawId);
                return (
                  <button
                    key={lawId}
                    type="button"
                    onClick={() => pickSeed(lawId)}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] hover:border-indigo-500/60"
                  >
                    <Pin className="size-3 text-muted" />
                    <span className="max-w-[14ch] truncate">{pinnedNode?.label ?? lawId}</span>
                  </button>
                );
              })}
            </div>
          )}
          <p className="hidden w-full text-[11px] text-muted md:block">{t('graph.filterDimHint')}</p>
          <span className="relative ml-auto hidden gap-2 md:flex">
            <Button
              size="sm"
              variant={filtersOpen ? 'secondary' : 'ghost'}
              icon={<Filter className="size-3.5" />}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              {t('graph.advancedFilters')}
            </Button>
            <GraphFilterPopover
              open={filtersOpen}
              filters={advancedFilters}
              onChange={setAdvancedFilters}
              onClose={() => setFiltersOpen(false)}
            />
            <Button
              size="sm"
              variant="ghost"
              icon={<Download className="size-3.5" />}
              onClick={() => graphRef.current?.exportPng()}
            >
              PNG
            </Button>
          </span>
        </div>

        <div className="relative flex-1 overflow-hidden bg-bg">
          <GraphCanvasLazy
            ref={graphRef}
            data={graph}
            visibleKinds={filters}
            selected={selected}
            onSelect={setSelected}
            matchNodeIds={matchNodeIds}
          />

          <div className="absolute bottom-4 left-4 max-w-[220px]">
            <button
              type="button"
              onClick={() => setLegendOpen((v) => !v)}
              className={cn('air-glass label-caps px-3 py-2 md:hidden', legendOpen && 'hidden')}
            >
              {t('graph.legendTitle')}
            </button>
            <div className={cn('air-glass max-h-[50vh] overflow-y-auto px-3.5 py-2.5', !legendOpen && 'hidden md:block')}>
              <div className="label-caps mb-2 flex items-center justify-between gap-4">
                <span>{t('graph.legendTitle')}</span>
                <button
                  type="button"
                  onClick={() => setLegendOpen(false)}
                  aria-label={t('graph.close')}
                  className="-mr-1 rounded p-0.5 text-muted hover:text-fg md:hidden"
                >
                  <X className="size-3.5" />
                </button>
              </div>

              {legendCommunities.length > 0 && (
                <div className="mb-3">
                  <div className="label-caps mb-1.5 text-[10px]">{t('graph.legend.clusters')}</div>
                  <div className="flex flex-col gap-1 text-[12px]">
                    {legendCommunities.map((community) => (
                      <div key={community} className="flex items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ background: resolveCommunityFill(community) }}
                          aria-hidden
                        />
                        {t('graph.legend.cluster', { id: community })}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {legendNodeKinds.length > 0 && (
                <div className="mb-3">
                  <div className="label-caps mb-1.5 text-[10px]">{t('graph.legend.nodeKinds')}</div>
                  <div className="flex flex-wrap gap-2 text-[12px]">
                    {legendNodeKinds.map((kind) => (
                      <div key={kind} className="flex items-center gap-1">
                        <KindShapeIcon kind={kind} />
                        <span>{NODE_KIND_LABELS[kind]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="label-caps mb-1.5 text-[10px]">{t('graph.edges')}</div>
              <div className="flex flex-col gap-1.5 text-[12px]">
                {legendEdgeKinds.map((kind) => (
                  <div key={kind} className="flex items-center gap-2">
                    <span className="block h-px w-5" style={{ background: GRAPH_EDGE_STROKE[kind] }} aria-hidden />
                    {EDGE_KIND_LABELS[kind]}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="air-glass absolute bottom-4 right-4 flex flex-col gap-1 p-1">
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('graph.zoomIn')}
              icon={<Plus className="size-3.5" />}
              onClick={() => graphRef.current?.zoomIn()}
            />
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('graph.zoomOut')}
              icon={<Minus className="size-3.5" />}
              onClick={() => graphRef.current?.zoomOut()}
            />
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('graph.fit', 'Ajustar a la vista')}
              icon={<Maximize2 className="size-3.5" />}
              onClick={() => graphRef.current?.fit()}
            />
          </div>
        </div>
      </div>

      <RightRail>
        {node ? (
          <>
            <div className="mb-3.5 flex items-center gap-2">
              <Badge style={{ background: badgeFill, color: 'white', border: 'transparent' }}>
                {NODE_KIND_LABELS[node.kind]}
              </Badge>
              <span className="ml-auto flex gap-1">
                <Button
                  size="icon-sm"
                  variant={isPinned(node.id) ? 'secondary' : 'ghost'}
                  aria-label={t('graph.pin')}
                  icon={<Pin className="size-3.5" />}
                  disabled={node.kind !== 'law'}
                  onClick={() => node.kind === 'law' && togglePin(node.id)}
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t('graph.close')}
                  onClick={() => setSelected(null)}
                  icon={<X className="size-3.5" />}
                />
              </span>
            </div>
            <h2 className="font-display text-xl font-semibold">{node.label}</h2>
            <GraphNodeRail node={node} selectedId={node.id} />

            <div className="label-caps mb-2 mt-4">{t('graph.connections')}</div>
            <div className="flex flex-col gap-1.5">
              {neighbours.map(({ edge: e, otherNode: o, otherId }) => (
                <Chip key={e.id} onClick={() => setSelected(otherId)} className="w-full justify-start text-left">
                  <span className="truncate">{o.label}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted">
                    {EDGE_KIND_LABELS[e.kind ?? 'cites']}
                  </span>
                </Chip>
              ))}
            </div>

            <Button
              className="mt-5 w-full"
              onClick={() => selected && node?.kind === 'law' && navigate(`/laws/${encodeURIComponent(selected)}`)}
              disabled={!selected || node?.kind !== 'law'}
            >
              {t('graph.openLaw')}
            </Button>
          </>
        ) : (
          <div className="text-[13px] text-muted">{t('graph.selectNode')}</div>
        )}
      </RightRail>
    </div>
  );
}
