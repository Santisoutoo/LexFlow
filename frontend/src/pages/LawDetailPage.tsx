import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Plus, X, GitCompareArrows, ExternalLink, Minus, Type } from 'lucide-react';
import { LawHeader } from '@/components/domain/LawHeader';
import { EmptyState } from '@/components/domain/EmptyState';
import { LawToc } from '@/components/domain/LawToc';
import { ReadingItemRenderer } from '@/components/domain/ReadingItemRenderer';
import { GraphCanvasLazy } from '@/components/domain/GraphCanvasLazy';
import { VersionTimeline } from '@/components/domain/VersionTimeline';
import { ErrorState } from '@/components/domain/ErrorState';
import { Skeleton, SkeletonLines } from '@/components/domain/Skeleton';
import { Badge, Button, Tabs } from '@/components/ui';
import { RightRail } from '@/components/shell/RightRail';
import { useAddUserTag, useGraph, useLaw, useRemoveUserTag, useUserTags, useVersions } from '@/lib/queries';
import { useUi } from '@/lib/store';
import { formatDate, cn, groupBy } from '@/lib/utils';
import { errorMessage } from '@/lib/errors';
import {
  buildReadingItems,
  flattenToc,
  parseArticleHash,
  VIRTUALIZE_THRESHOLD,
} from '@/lib/law-reading';
import type { Article, ArticleRef, GraphData, GraphNodeKind, HierarchyNode, LawDetail, LawVersion } from '@/lib/types';
import { REFERENCE_KIND_LABELS } from '@/lib/graph-colors';
import { RelatedLaws } from './RelatedLaws';

const VERSION_KIND_BADGE: Record<'publish' | 'default', string> = {
  publish: 'bg-primary-soft text-indigo-700',
  default: 'bg-amber-soft text-amber-700',
};

const ALL_GRAPH_KINDS: GraphNodeKind[] = ['law', 'article', 'reference', 'amendment', 'repealed'];

type Tab = 'texto' | 'versiones' | 'grafo' | 'refs' | 'disc';

/**
 * `versions` is newest-first (git log). `toIndex` is the row the user
 * clicked; the parent commit is the next (older) entry. Null when the
 * row is the oldest version and has no parent to diff against.
 */
function buildDiffSearchParams(
  versions: LawVersion[],
  toIndex: number,
): { from: string; to: string } | null {
  const to = versions[toIndex];
  const from = versions[toIndex + 1];
  if (!to || !from) return null;
  return { from: from.tag, to: to.tag };
}

export function LawDetailPage() {
  const { lawId } = useParams<{ lawId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const readingSize = useUi((s) => s.readingSize);
  const setReadingSize = useUi((s) => s.setReadingSize);
  const readingSerif = useUi((s) => s.readingSerif);
  const setReadingSerif = useUi((s) => s.setReadingSerif);
  const [tab, setTab] = useState<Tab>('texto');
  const [selectedRef, setSelectedRef] = useState<ArticleRef | null>(null);

  useEffect(() => {
    if (parseArticleHash(location.hash)) {
      setTab('texto');
    }
  }, [location.hash]);

  const { data: law, isLoading, error, refetch } = useLaw(lawId);
  const { data: versions = [], isLoading: versionsLoading } = useVersions(lawId);
  // #670 — custom user tags on this law. Keyed off the route param (like
  // `useVersions`/`useGraph` above), not `law.id`, so the hook can be
  // called before the `!law` early-return without an unsafe `law.id` access.
  const { data: userTags = [] } = useUserTags(lawId);
  const addUserTagMut = useAddUserTag();
  const removeUserTagMut = useRemoveUserTag();
  // Hoisted here (rather than inside LawDetailGraphTab) so the related-laws
  // panel in the right rail is populated on every tab, not just 'grafo'.
  // TanStack Query deduplicates the request — LawDetailGraphTab uses the same
  // cache key, so there is only ever one network call.
  //
  // Audit #713 P2 proposed gating this with `enabled: tab === 'grafo'`. Rejected
  // on purpose: `DetailRightRail` below consumes `graph` for the related-laws
  // panel on EVERY tab, so gating it would leave that panel empty outside the
  // grafo tab. The subgraph is genuinely needed on load — do not gate it.
  const { data: graph } = useGraph(lawId);

  // Articles already arrive embedded in the law-detail response — no
  // need to fetch them a second time (the old `api.laws.references()`
  // shim re-fetched `/laws/{id}` for this, which transferred the body
  // twice). Empty array fallback keeps the rendering loop happy until
  // `useLaw` resolves. Memoised so the dependent `lawRefs` memo only
  // recomputes when the underlying array actually changes.
  const articles = useMemo<Article[]>(() => law?.articles ?? [], [law]);
  const disposiciones = useMemo(() => law?.disposiciones ?? [], [law]);
  const handleRefClick = useCallback((ref: ArticleRef) => setSelectedRef(ref), []);
  // Audit #469 — refs/grafo tabs used to show "tab pending" stubs even
  // though the backend has exposed both surfaces for sprints. Flatten
  // every outgoing reference from the embedded articles for the refs
  // tab; the grafo tab seeds `useGraph` with this law id and renders
  // the inline canvas. We compute both unconditionally so the page can
  // switch tabs without refetching.
  const lawRefs = useMemo<ArticleRef[]>(() => {
    const seen = new Set<string>();
    const out: ArticleRef[] = [];
    const pushRef = (ref: ArticleRef, fallbackSource: string) => {
      const sourceArticle = ref.sourceArticle ?? fallbackSource;
      const key = `${ref.label}|${sourceArticle}|${ref.target?.lawId ?? ''}|${ref.target?.articleNum ?? ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(sourceArticle === ref.sourceArticle ? ref : { ...ref, sourceArticle });
    };
    for (const article of articles) {
      for (const ref of article.refs ?? []) pushRef(ref, article.num);
    }
    for (const disposicion of disposiciones) {
      for (const ref of disposicion.refs ?? []) pushRef(ref, disposicion.heading);
    }
    return out;
  }, [articles, disposiciones]);

  if (error) return <div className="p-10"><ErrorState description={errorMessage(error, t)} onRetry={() => refetch()} /></div>;
  if (!law || isLoading) return <LoadingSkeleton />;

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <LawHeader
          law={law}
          versionsCount={versions.length}
          onTagClick={(t) => navigate(`/explorer?tags=${encodeURIComponent(t)}`)}
          userTags={userTags}
          onAddUserTag={(label) => addUserTagMut.mutate({ lawId: law.id, label })}
          onRemoveUserTag={(tag) => removeUserTagMut.mutate({ lawId: law.id, tag })}
        />

        <div className="border-b border-border px-5 md:px-8">
          <Tabs
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            tabs={[
              { id: 'texto', label: t('lawDetail.tabs.texto'), count: law.articulos },
              // #592 — count the real version history (useVersions), not the
              // law-detail `versiones` field, which the backend leaves at 0
              // (the count needs git log, served by /laws/{id}/versions).
              { id: 'versiones', label: t('lawDetail.tabs.versiones'), count: versions.length },
              { id: 'grafo', label: t('lawDetail.tabs.grafo') },
              { id: 'refs', label: t('lawDetail.tabs.refs'), count: law.referencias },
              { id: 'disc', label: t('lawDetail.tabs.disc') },
            ]}
          />
        </div>

        {tab === 'texto' && (
          <TextoTab
            hierarchy={law.hierarchy}
            articles={articles}
            disposiciones={disposiciones}
            rawText={law.rawText}
            sectionsOnly={law.articulos === 0 && articles.length === 0}
            readingSize={readingSize}
            readingSerif={readingSerif}
            onDecreaseSize={() => setReadingSize(readingSize - 1)}
            onIncreaseSize={() => setReadingSize(readingSize + 1)}
            onToggleSerif={() => setReadingSerif(!readingSerif)}
            onRefClick={handleRefClick}
          />
        )}
        {tab === 'versiones' && (
          <div className="flex-1 overflow-auto p-8 scrollbar-thin">
            <VersionTimeline versions={versions} current={versions[0]?.tag} />
            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-base font-semibold">{t('lawDetail.changesByVersion')}</h3>
                <Button size="sm" variant="secondary" icon={<GitCompareArrows className="size-3.5" />}
                  disabled={versionsLoading || versions.length < 2}
                  onClick={() => navigate(`/laws/${encodeURIComponent(lawId ?? '')}/diff`)}>
                  {t('lawDetail.compareVersions')}
                </Button>
              </div>
              {versions.map((v, i) => {
                const diffParams = buildDiffSearchParams(versions, i);
                return (
                  <div key={v.tag} className="mb-2.5 flex items-center gap-3.5 rounded-xl border border-border bg-surface p-4">
                    <span className={cn('inline-flex size-9 items-center justify-center rounded-md', VERSION_KIND_BADGE[v.kind === 'publish' ? 'publish' : 'default'])}>
                      {v.kind === 'publish' ? <Plus className="size-4" /> : <GitCompareArrows className="size-4" />}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono font-semibold">{v.tag}</span>
                        <span className="text-sm">{v.label}</span>
                        {i === 0 && <Badge tone="success">vigente</Badge>}
                      </div>
                      <div className="mt-0.5 text-[12px] text-muted">{formatDate(v.date)}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={versionsLoading || !diffParams}
                      onClick={() => {
                        if (!diffParams || !lawId) return;
                        navigate(
                          `/laws/${encodeURIComponent(lawId)}/diff?from=${encodeURIComponent(diffParams.from)}&to=${encodeURIComponent(diffParams.to)}`,
                        );
                      }}
                    >
                      {t('lawDetail.viewChanges')}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {tab === 'grafo' && lawId && (
          <LawDetailGraphTab
            lawId={lawId}
            graph={graph}
            onOpenGlobalGraph={() => navigate(`/graph?view=global&law=${encodeURIComponent(lawId)}`)}
          />
        )}
        {tab === 'refs' && (
          <LawDetailRefsTab refs={lawRefs} onRefClick={setSelectedRef} />
        )}
        {tab === 'disc' && (
          <div className="flex-1 overflow-auto p-12 text-center text-muted">
            <p>{t('lawDetail.tabPending', { tab: t('lawDetail.tabs.disc') })}</p>
          </div>
        )}
      </div>

      <RightRail>
        <DetailRightRail
          law={law}
          graph={graph}
          lawId={lawId ?? ''}
          selectedRef={selectedRef}
          onDismiss={() => setSelectedRef(null)}
          onNavigate={navigate}
        />
      </RightRail>
    </div>
  );
}

/**
 * Audit #469 — refs tab. Render every outgoing reference the law has,
 * grouped by source article when possible. Clicking a ref opens the
 * detail right-rail card via the parent's ``setSelectedRef``.
 */
function LawDetailRefsTab({ refs, onRefClick }: { refs: ArticleRef[]; onRefClick: (r: ArticleRef) => void }) {
  const { t } = useTranslation();
  if (refs.length === 0) {
    return (
      <div className="flex-1 overflow-auto p-12 text-center text-muted">
        <p>{t('lawDetail.refsEmpty')}</p>
      </div>
    );
  }
  const grouped = groupBy(refs, (ref) => ref.sourceArticle ?? '—');
  return (
    <div className="flex-1 overflow-auto p-6 md:p-8 scrollbar-thin">
      <div className="mb-3 label-caps">{t('lawDetail.refsHeading', { n: refs.length })}</div>
      <div className="flex flex-col gap-5">
        {Object.entries(grouped).map(([source, group]) => (
          <section key={source}>
            <div className="mb-2 label-caps">
              {source === '—'
                ? t('lawDetail.refsUngrouped')
                : t('lawDetail.refsFromArticle', { article: source })}
            </div>
            <div className="flex flex-col gap-1">
              {group.map((ref, i) => (
                <button
                  key={`${ref.label}-${source}-${i}`}
                  type="button"
                  onClick={() => onRefClick(ref)}
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-[13px] hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{ref.label}</span>
                  {ref.relationKind && (
                    <Badge tone="outline">{REFERENCE_KIND_LABELS[ref.relationKind]}</Badge>
                  )}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/**
 * Audit #469 — grafo tab. Embed the existing GraphCanvas seeded on the
 * current law so the user can explore the local neighbourhood without
 * leaving the page. ``Open global view`` still navigates to the full
 * ``/graph`` page for corpus-wide exploration.
 *
 * Accepts the pre-fetched `graph` from the parent (hoisted at page level)
 * so TanStack Query's cache is shared — no duplicate network request.
 */
function LawDetailGraphTab({
  lawId,
  graph,
  onOpenGlobalGraph,
}: {
  lawId: string;
  /** Pre-fetched subgraph from the parent; `undefined` while loading. */
  graph: GraphData | undefined;
  onOpenGlobalGraph: () => void;
}) {
  const { t } = useTranslation();
  const visibleKinds = useMemo(() => new Set(ALL_GRAPH_KINDS), []);
  const [selected, setSelected] = useState<string | null>(lawId);
  // Re-subscribe so we get `isLoading` / `error` states without re-fetching.
  const { isLoading, error } = useGraph(lawId);
  if (error) {
    return (
      <div className="flex-1 overflow-auto p-12 text-center text-muted">
        <ErrorState description={errorMessage(error, t)} />
      </div>
    );
  }
  if (!graph || isLoading) {
    return <div className="flex-1 overflow-auto p-12 text-center text-muted">{t('graph.loading')}</div>;
  }
  return (
    <div className="relative flex-1 overflow-hidden bg-bg">
      <GraphCanvasLazy data={graph} visibleKinds={visibleKinds} selected={selected} onSelect={setSelected} />
      <Button
        className="absolute top-3 right-3"
        size="sm"
        variant="secondary"
        onClick={onOpenGlobalGraph}
      >
        {t('lawDetail.openGlobalGraph')}
      </Button>
    </div>
  );
}

function TextoTab({
  hierarchy,
  articles,
  disposiciones,
  rawText,
  sectionsOnly,
  readingSize,
  readingSerif,
  onDecreaseSize,
  onIncreaseSize,
  onToggleSerif,
  onRefClick,
}: {
  hierarchy: HierarchyNode[];
  articles: Article[];
  disposiciones: LawDetail['disposiciones'];
  rawText?: string;
  sectionsOnly: boolean;
  readingSize: number;
  readingSerif: boolean;
  onDecreaseSize: () => void;
  onIncreaseSize: () => void;
  onToggleSerif: () => void;
  onRefClick: (r: ArticleRef) => void;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeTocId, setActiveTocId] = useState<string | undefined>();
  const [highlightedArticleNum, setHighlightedArticleNum] = useState<string | null>(null);

  const readingItems = useMemo(
    () => buildReadingItems({ hierarchy, articles, disposiciones, rawText }),
    [hierarchy, articles, disposiciones, rawText],
  );
  const tocItems = useMemo(() => flattenToc(hierarchy), [hierarchy]);
  const isVirtualized = readingItems.length > VIRTUALIZE_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: readingItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 200,
    overscan: 5,
  });

  const scrollToTarget = useCallback(
    (targetId: string) => {
      const scrollEl = scrollRef.current;
      if (!scrollEl) return;

      if (targetId.startsWith('art-')) {
        const num = targetId.slice('art-'.length);
        const index = readingItems.findIndex(
          (item) => item.kind === 'article' && item.article.num === num,
        );
        if (index < 0) return;

        if (isVirtualized) {
          virtualizer.scrollToIndex(index, { align: 'start' });
        } else {
          scrollEl.querySelector<HTMLElement>(`#${CSS.escape(targetId)}`)?.scrollIntoView({ block: 'start' });
        }
        setHighlightedArticleNum(num);
        return;
      }

      if (isVirtualized) {
        const index = readingItems.findIndex(
          (item) => item.kind === 'section' && item.targetId === targetId,
        );
        if (index >= 0) {
          virtualizer.scrollToIndex(index, { align: 'start' });
        }
      } else {
        scrollEl.querySelector<HTMLElement>(`#${CSS.escape(targetId)}`)?.scrollIntoView({ block: 'start' });
      }
      setActiveTocId(targetId);
    },
    [isVirtualized, readingItems, virtualizer],
  );

  useEffect(() => {
    const articleNum = parseArticleHash(location.hash);
    if (!articleNum) return;

    const timer = window.setTimeout(() => {
      scrollToTarget(`art-${articleNum}`);
    }, 50);
    return () => window.clearTimeout(timer);
  }, [location.hash, readingItems, isVirtualized, scrollToTarget]);

  useEffect(() => {
    if (!highlightedArticleNum) return;
    const timer = window.setTimeout(() => setHighlightedArticleNum(null), 3000);
    return () => window.clearTimeout(timer);
  }, [highlightedArticleNum]);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl || typeof IntersectionObserver === 'undefined') return;

    const anchors = scrollEl.querySelectorAll<HTMLElement>('[id^="art-"], [id^="section-"]');
    if (!anchors.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const top = visible[0]?.target.id;
        if (top) setActiveTocId(top);
      },
      { root: scrollEl, rootMargin: '-20% 0px -70% 0px', threshold: 0 },
    );

    anchors.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [readingItems, isVirtualized]);

  const renderItem = (index: number) => {
    const item = readingItems[index];
    if (!item) return null;
    return (
      <ReadingItemRenderer
        item={item}
        index={index}
        readingSize={readingSize}
        readingSerif={readingSerif}
        highlightedArticleNum={highlightedArticleNum}
        onRefClick={onRefClick}
      />
    );
  };

  return (
    <div className="flex min-h-0 flex-1">
      <LawToc items={tocItems} activeId={activeTocId} onNavigate={scrollToTarget} />
      <div ref={scrollRef} className="flex-1 overflow-auto scrollbar-thin">
        <div className="reading-col px-5 md:px-8 py-9">
          <div className="mb-6 flex items-center justify-end gap-2 max-w-measure">
            <button
              type="button"
              onClick={onDecreaseSize}
              disabled={readingSize <= 14}
              className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted hover:bg-surface-2 disabled:opacity-40"
              aria-label={t('lawDetail.reading.decrease')}
            >
              <Minus className="size-3.5" />
            </button>
            <span className="font-mono text-[12px] text-muted" aria-hidden="true">A</span>
            <button
              type="button"
              onClick={onIncreaseSize}
              disabled={readingSize >= 22}
              className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted hover:bg-surface-2 disabled:opacity-40"
              aria-label={t('lawDetail.reading.increase')}
            >
              <Plus className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={onToggleSerif}
              className={cn(
                'inline-flex h-8 items-center gap-1 rounded-md border px-2 text-[12px]',
                readingSerif ? 'border-indigo-400 bg-primary-soft text-indigo-700' : 'border-border text-muted hover:bg-surface-2',
              )}
              aria-pressed={readingSerif}
              aria-label={t('lawDetail.reading.serifToggle')}
            >
              <Type className="size-3.5" />
              {t('lawDetail.reading.serif')}
            </button>
          </div>

          {sectionsOnly && readingItems.length > 0 && (
            <p className="mb-4 max-w-measure text-[12px] text-muted">{t('lawDetail.empty.sectionsOnly')}</p>
          )}

          {readingItems.length === 0 ? (
            <EmptyState
              className="max-w-measure"
              title={t('lawDetail.empty.noContent.title')}
              description={t('lawDetail.empty.noContent.description')}
            />
          ) : (
            <div className="max-w-measure">
              {isVirtualized ? (
                <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
                  {virtualizer.getVirtualItems().map((virtualRow) => (
                    <div
                      key={virtualRow.key}
                      data-index={virtualRow.index}
                      ref={virtualizer.measureElement}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <ReadingItemRenderer
                        item={readingItems[virtualRow.index]}
                        index={virtualRow.index}
                        readingSize={readingSize}
                        readingSerif={readingSerif}
                        highlightedArticleNum={highlightedArticleNum}
                        onRefClick={onRefClick}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                readingItems.map((_, index) => renderItem(index))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Flattens every article's outgoing references into a deduped, capped
 * list for the "Referencias relacionadas" panel. Refs are deduped by
 * their display label (the same target can be cited from several
 * articles) and the first occurrence wins so the earliest article's
 * resolved target is preserved.
 *
 * WHERE TO CHANGE IF X CHANGES: references live on
 * ``law.articles[].refs`` (``ArticleRef[]``) — see `src/lib/types.ts`.
 */
function relatedRefsFor(articles: Article[]): ArticleRef[] {
  const seen = new Set<string>();
  const unique: ArticleRef[] = [];
  for (const article of articles) {
    for (const ref of article.refs) {
      if (seen.has(ref.label)) continue;
      seen.add(ref.label);
      unique.push(ref);
    }
  }
  return unique.slice(0, 4);
}

function DetailRightRail({
  law,
  graph,
  lawId,
  selectedRef,
  onDismiss,
  onNavigate,
}: {
  law: LawDetail;
  /** Subgraph centred on this law; `undefined` while the request is in-flight. */
  graph: GraphData | undefined;
  /** The current law's id — passed to `RelatedLaws` to exclude itself. */
  lawId: string;
  selectedRef: ArticleRef | null;
  onDismiss: () => void;
  onNavigate: (to: string) => void;
}) {
  const { t } = useTranslation();
  const relatedRefs = useMemo(() => relatedRefsFor(law.articles), [law.articles]);

  return (
    <>
      <div className="mb-3.5 flex items-center justify-between">
        <span className="label-caps">{selectedRef ? t('lawDetail.citationSelected') : t('lawDetail.lawInfo')}</span>
        {selectedRef && (
          <button onClick={onDismiss} className="text-muted hover:text-fg">
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {selectedRef ? (
        // ``ArticleRef`` carries only a label + optional resolved target —
        // it has no snippet/date/article body to build a faithful
        // ``ChatSource`` for the CitationCard, so we surface the real ref
        // label and let the user jump to the target law instead of
        // fabricating a citation card (issue #480).
        <div className="space-y-3">
          <div>
            <h3 className="font-display text-base font-semibold">{selectedRef.label}</h3>
            <p className="mt-1 text-[12.5px] text-muted">
              {selectedRef.sourceArticle
                ? t('lawDetail.citedFromArticle', { article: selectedRef.sourceArticle })
                : t('lawDetail.citedFrom', { law: law.short })}
            </p>
            {selectedRef.relationKind && (
              <div className="mt-2">
                <Badge tone="outline">{REFERENCE_KIND_LABELS[selectedRef.relationKind]}</Badge>
              </div>
            )}
          </div>
          {selectedRef.target && (
            <button
              onClick={() => selectedRef.target && onNavigate(`/laws/${encodeURIComponent(selectedRef.target.lawId)}`)}
              className="flex items-center gap-2 rounded px-1.5 py-1.5 text-[13px] hover:bg-surface-2"
            >
              <ExternalLink className="size-3 text-muted" /> {selectedRef.label}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[13px] text-muted">
            {t('lawDetail.selectCitation')}
          </p>
        </div>
      )}

      {relatedRefs.length > 0 && (
        <>
          <div className="label-caps mb-2 mt-5">{t('lawDetail.relatedRefs')}</div>
          <div className="flex flex-col gap-0.5">
            {relatedRefs.map((ref) => {
              const targetLawId = ref.target?.lawId;
              return (
                <button
                  key={ref.label}
                  disabled={!targetLawId}
                  onClick={() => targetLawId && onNavigate(`/laws/${encodeURIComponent(targetLawId)}`)}
                  className="flex items-center gap-2 rounded px-1.5 py-1.5 text-[13px] hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <ExternalLink className="size-3 text-muted" /> {ref.label}
                </button>
              );
            })}
          </div>
        </>
      )}

      <RelatedLaws
        graph={graph}
        currentLawId={lawId}
        onNavigate={(id) => onNavigate(`/laws/${encodeURIComponent(id)}`)}
      />
    </>
  );
}

/**
 * Mimics the actual reading-column shape so the layout doesn't shift
 * when the law arrives — header badges, title, subtitle, tab strip,
 * then two article blocks worth of paragraph skeletons. Reuses the
 * shared `<Skeleton>` family so dark/light + the future motion-reduce
 * variants stay consistent across pages.
 */
function LoadingSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col" aria-busy>
      {/* Header (matches LawHeader's height + badge strip) */}
      <div className="border-b border-border px-5 md:px-8 py-6">
        <div className="mb-3 flex items-center gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-3.5 w-24" />
        </div>
        <Skeleton className="mb-2 h-8 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
      </div>

      {/* Tab strip */}
      <div className="border-b border-border px-5 md:px-8">
        <div className="flex gap-6 py-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-4 w-20" />
          ))}
        </div>
      </div>

      {/* Reading column — two article blocks worth */}
      <div className="reading-col flex-1 overflow-auto px-5 md:px-8 py-8 scrollbar-thin">
        {[0, 1].map((blockIdx) => (
          <div key={blockIdx} className="mb-10">
            <Skeleton className="mb-3 h-5 w-32" />
            <SkeletonLines count={5} />
          </div>
        ))}
      </div>
    </div>
  );
}
