/**
 * SearchResultsPage — dedicated `/search` surface for full-text, semantic
 * and hybrid ranking (#57 S1.1).
 *
 * Reads `?q=` and `?mode=` (`fulltext` | `semantic` | `hybrid`, default
 * `fulltext`). Mode lives in the URL so the palette and Explorer can
 * deep-link. Semantic/hybrid degrade when the backend extra is inactive
 * (Settings → Modelos) — tabs stay clickable, a callout points there.
 *
 * WHERE TO CHANGE IF X CHANGES: ranking hooks live in `lib/queries.ts`;
 * hit → law-detail href is `lawDetailHref` in `lib/law-reading.ts`.
 */
import { useMemo, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpenText, ChevronRight, FileText, Search } from 'lucide-react';
import { Badge, Callout, Input, Tabs } from '@/components/ui';
import { EmptyState } from '@/components/domain/EmptyState';
import { ErrorState } from '@/components/domain/ErrorState';
import { HighlightedSnippet } from '@/components/domain/HighlightedSnippet';
import { Skeleton } from '@/components/domain/Skeleton';
import { lawDetailHref } from '@/lib/law-reading';
import {
  useHybridSearch,
  useSearch,
  useSemanticSearch,
  useSemanticStatus,
} from '@/lib/queries';
import { parseSearchInput, parseSearchMode, type SearchMode } from '@/lib/search-query';
import type { HighlightRange } from '@/components/domain/HighlightedSnippet';
import type { HybridSearchHit, SearchHit, SemanticSearchHit } from '@/lib/types';
import { NODE_KIND_LABELS } from '@/lib/graph-colors';
import { formatDate, statusLabel } from '@/lib/utils';

const MIN_QUERY_LENGTH = 2;

export function SearchResultsPage() {
  const { t } = useTranslation();
  const [params, setSearchParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const mode = parseSearchMode(params.get('mode'));
  const { plainQ } = useMemo(() => parseSearchInput(q), [q]);
  const canSearch = plainQ.trim().length >= MIN_QUERY_LENGTH;

  const { data: semanticStatus } = useSemanticStatus();
  const semanticActive = semanticStatus?.active ?? false;
  const needsSemantic = mode === 'semantic' || mode === 'hybrid';
  const showUnavailable = needsSemantic && semanticStatus !== undefined && !semanticActive;

  const commit = (nextQ: string, nextMode: SearchMode) => {
    const next = new URLSearchParams();
    if (nextQ) next.set('q', nextQ);
    next.set('mode', nextMode);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border px-5 pt-4 pb-3.5 md:px-8 md:pt-5">
        <h1 className="mb-3.5 font-display text-2xl font-semibold">{t('search.title')}</h1>
        <div className="flex flex-wrap items-center gap-2.5">
          <Input
            icon={<Search className="size-3.5" />}
            placeholder={t('search.placeholder')}
            value={q}
            onChange={(e) => commit(e.target.value, mode)}
            className="min-w-[200px] max-w-[480px] flex-1"
            aria-label={t('search.placeholder')}
          />
          <Tabs
            variant="segmented"
            value={mode}
            onChange={(id) => commit(q, parseSearchMode(id))}
            tabs={[
              { id: 'fulltext', label: t('search.modeFullText') },
              { id: 'semantic', label: t('search.modeSemantic') },
              { id: 'hybrid', label: t('search.modeHybrid') },
            ]}
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto scrollbar-thin">
        {showUnavailable && (
          <Callout tone="warning" title={t('search.modeSemantic')} className="mx-5 mt-4 md:mx-8">
            <p>{t('search.semanticUnavailable')}</p>
            <Link to="/settings" className="mt-2 inline-block text-[13px] font-medium text-indigo-600 hover:underline">
              {t('search.openSettings')}
            </Link>
          </Callout>
        )}
        {!canSearch ? (
          <div className="p-8">
            <EmptyState title={t('search.empty.title')} description={t('search.semanticEmptyQuery')} />
          </div>
        ) : mode === 'semantic' ? (
          <SemanticResults q={plainQ} semanticActive={semanticActive} />
        ) : mode === 'hybrid' ? (
          <HybridResults q={plainQ} semanticActive={semanticActive} />
        ) : (
          <FullTextResults q={plainQ} />
        )}
      </div>
    </div>
  );
}

function FullTextResults({ q }: { q: string }) {
  const { t } = useTranslation();
  const { data, isLoading, isError, error, refetch } = useSearch(q);
  if (isError) {
    return (
      <div className="p-8">
        <ErrorState onRetry={() => refetch()} error={error} />
      </div>
    );
  }
  const hits = data?.hits ?? [];
  if (!isLoading && hits.length === 0) {
    return (
      <div className="p-8">
        <EmptyState title={t('search.empty.title')} description={t('search.empty.description')} />
      </div>
    );
  }
  return (
    <ResultList
      loading={isLoading && !data}
      heading={t('search.resultsFor', { count: data?.total ?? hits.length, q })}
    >
      {hits.map((hit) => (
        <FullTextRow key={hit.id} hit={hit} />
      ))}
    </ResultList>
  );
}

function SemanticResults({ q, semanticActive }: { q: string; semanticActive: boolean }) {
  const { t } = useTranslation();
  const { data, isLoading, isError, error, refetch } = useSemanticSearch(q);
  if (isError) {
    return (
      <div className="p-8">
        <ErrorState onRetry={() => refetch()} error={error} />
      </div>
    );
  }
  const hits = data?.hits ?? [];
  if (!isLoading && hits.length === 0) {
    return (
      <div className="p-8">
        <EmptyState title={t('search.semanticEmpty.title')} description={t('search.semanticEmpty.description')} />
      </div>
    );
  }
  const maxScore = hits.length > 0 ? Math.max(...hits.map((hit) => hit.score), 0) : 0;
  return (
    <ResultList
      loading={isLoading && !data}
      heading={t('search.semanticHeading', { count: hits.length })}
      notice={
        !semanticActive && hits.length > 0 ? (
          <BasicModeNotice />
        ) : undefined
      }
    >
      {hits.map((hit) => (
        <SemanticRow
          key={`${hit.lawId}-${hit.articleNumber}`}
          hit={hit}
          semanticActive={semanticActive}
          scoreRatio={maxScore > 0 ? hit.score / maxScore : 0}
        />
      ))}
    </ResultList>
  );
}

function BasicModeNotice() {
  const { t } = useTranslation();
  return (
    <div className="border-b border-border px-5 py-2.5 text-[12.5px] text-muted md:px-8">
      <p>{t('search.basicModeNotice')}</p>
      <Link to="/settings" className="mt-1 inline-block text-[13px] font-medium text-indigo-600 hover:underline">
        {t('search.openSettings')}
      </Link>
    </div>
  );
}

function HybridResults({ q, semanticActive }: { q: string; semanticActive: boolean }) {
  const { t } = useTranslation();
  const { data, isLoading, isError, error, refetch } = useHybridSearch(q);
  if (isError) {
    return (
      <div className="p-8">
        <ErrorState onRetry={() => refetch()} error={error} />
      </div>
    );
  }
  const hits = data?.hits ?? [];
  if (!isLoading && hits.length === 0) {
    return (
      <div className="p-8">
        <EmptyState title={t('search.empty.title')} description={t('search.empty.description')} />
      </div>
    );
  }
  return (
    <ResultList
      loading={isLoading && !data}
      heading={t('search.hybridHeading', { count: hits.length })}
      notice={
        !semanticActive && hits.length > 0 ? (
          <BasicModeNotice />
        ) : undefined
      }
    >
      {hits.map((hit) => (
        <HybridRow key={`${hit.lawId}-${hit.articleNumber ?? 'law'}`} hit={hit} />
      ))}
    </ResultList>
  );
}

function ResultList({
  loading,
  heading,
  notice,
  children,
}: {
  loading: boolean;
  heading: string;
  notice?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="divide-y divide-border">
      <p className="px-5 py-3 text-[12.5px] text-muted md:px-8">{heading}</p>
      {notice}
      {loading &&
        Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2 px-8 py-4">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-2.5 w-2/3" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
        ))}
      {children}
    </div>
  );
}

function FullTextRow({ hit }: { hit: SearchHit }) {
  const navigate = useNavigate();
  const lawId = (typeof hit.payload?.lawId === 'string' ? hit.payload.lawId : undefined) ?? hit.id;
  const articleNum =
    hit.articleNumber
    ?? (typeof hit.payload?.articleNum === 'string' ? hit.payload.articleNum : undefined);
  const href = lawDetailHref(lawId, articleNum);
  const heading = hit.articleTitle ?? hit.title;
  return (
    <HitRow
      href={href}
      onOpen={() => navigate(href)}
      icon={hit.kind === 'article' ? 'article' : 'law'}
      heading={heading}
      lawTitle={hit.articleTitle != null ? hit.title : undefined}
      articleNum={articleNum}
      status={hit.status}
      meta={[hit.rango, hit.publicada ? formatDate(hit.publicada) : null]}
      snippet={hit.snippet}
      match={hit.match ?? null}
    />
  );
}

function SemanticRow({
  hit,
  semanticActive,
  scoreRatio,
}: {
  hit: SemanticSearchHit;
  semanticActive: boolean;
  scoreRatio: number;
}) {
  const navigate = useNavigate();
  const href = lawDetailHref(hit.lawId, hit.articleNumber);
  return (
    <HitRow
      href={href}
      onOpen={() => navigate(href)}
      icon="article"
      heading={`Art. ${hit.articleNumber}`}
      articleNum={hit.articleNumber}
      snippet={hit.snippet}
      semanticActive={semanticActive}
      scorePercent={semanticActive ? Math.round(hit.score * 100) : undefined}
      scoreRatio={semanticActive ? undefined : scoreRatio}
    />
  );
}

function HybridRow({ hit }: { hit: HybridSearchHit }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const href = lawDetailHref(hit.lawId, hit.articleNumber);
  const sourceLabel = (source: string) =>
    source === 'semantic' ? t('search.sourceSemantic') : t('search.sourceFullText');
  return (
    <HitRow
      href={href}
      onOpen={() => navigate(href)}
      icon={hit.articleNumber ? 'article' : 'law'}
      heading={hit.articleNumber ? `Art. ${hit.articleNumber}` : hit.lawId}
      articleNum={hit.articleNumber ?? undefined}
      snippet={hit.snippet}
      badges={hit.sources.map(sourceLabel)}
    />
  );
}

function HitRow({
  href,
  onOpen,
  icon,
  heading,
  lawTitle,
  articleNum,
  status,
  meta,
  snippet,
  match,
  scorePercent,
  scoreRatio,
  semanticActive = true,
  badges,
}: {
  href: string;
  onOpen: () => void;
  icon: 'law' | 'article';
  heading: string;
  lawTitle?: string;
  articleNum?: string;
  status?: SearchHit['status'];
  meta?: Array<string | null | undefined>;
  snippet?: string;
  match?: HighlightRange | HighlightRange[] | null;
  scorePercent?: number;
  scoreRatio?: number;
  semanticActive?: boolean;
  badges?: string[];
}) {
  const metaLine = meta?.filter(Boolean).join(' · ');
  return (
    <div
      role="link"
      tabIndex={0}
      data-href={href}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className="group flex cursor-pointer items-start gap-3.5 px-8 py-4 transition-colors hover:bg-surface-2/50"
    >
      <span
        className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-primary-soft text-indigo-700 dark:text-indigo-200"
        aria-label={NODE_KIND_LABELS[icon]}
      >
        {icon === 'article' ? <FileText className="size-3.5" aria-hidden /> : <BookOpenText className="size-3.5" aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate font-semibold leading-snug">{heading}</span>
          {status && (
            <Badge tone={status === 'vigente' ? 'success' : status === 'derogada' ? 'danger' : 'amber'}>
              {statusLabel(status)}
            </Badge>
          )}
          {articleNum && (
            <span className="shrink-0 font-mono text-[11px] text-muted">Art.&nbsp;{articleNum}</span>
          )}
          {semanticActive && scorePercent != null && (
            <span className="shrink-0 font-mono text-[11px] text-muted">{scorePercent}%</span>
          )}
          {!semanticActive && scoreRatio != null && (
            <span
              role="progressbar"
              aria-valuenow={Math.round(scoreRatio * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              data-testid="search-score-bar"
              className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-surface-2"
            >
              <span
                className="block h-full rounded-full bg-primary-soft"
                style={{ width: `${Math.round(scoreRatio * 100)}%` }}
              />
            </span>
          )}
          {badges?.map((label) => (
            <Badge key={label} tone="outline">{label}</Badge>
          ))}
        </div>
        {lawTitle && <div className="truncate text-[12px] text-muted">{lawTitle}</div>}
        {metaLine && <div className="mt-0.5 font-mono text-[11px] text-muted">{metaLine}</div>}
        {snippet && (
          <HighlightedSnippet
            text={snippet}
            match={match ?? null}
            className="mt-1 line-clamp-2 text-[12.5px] text-muted"
          />
        )}
      </div>
      <ChevronRight className="mt-1 size-3.5 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  );
}
