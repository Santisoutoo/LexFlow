import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Download, ChevronRight, BookOpenText, Hash, SlidersHorizontal, X, FileText } from 'lucide-react';
import { Badge, Button, Callout, Chip, Input, Tabs } from '@/components/ui';
import { EmptyState } from '@/components/domain/EmptyState';
import { HighlightedSnippet } from '@/components/domain/HighlightedSnippet';
import { SearchInterpretationBanner } from '@/components/domain/SearchInterpretationBanner';
import { Skeleton } from '@/components/domain/Skeleton';
import { FilterRail } from '@/pages/explorer/FilterRail';
import { applyClientFilterSort, type LawSort } from '@/pages/explorer/client-filter-sort';
import { buildExplorerFilterSummary } from '@/pages/explorer/empty-hints';
import {
  clearedExplorerState,
  parseExplorerParams,
  serializeExplorerParams,
  type ExplorerUrlState,
} from '@/pages/explorer/url-state';
import { lawDetailHref } from '@/lib/law-reading';
import { useLawsList, useTags, useDepartments, useSearch, useUserTagVocab, useUserTagLaws } from '@/lib/queries';
import { useUi } from '@/lib/store';
import { cn, formatDate, formatNumber, statusLabel } from '@/lib/utils';
import { RANK_MAP, STATUS_MAP, SCOPE_MAP } from '@/lib/api/transformers';
import type { LawStatus, RangoNormativo, Ambito, JurisdictionCode, SearchFacets } from '@/lib/types';
import { COMMUNITIES } from '@/lib/types';

export function ExplorerPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const density = useUi((s) => s.density);
  const setDensity = useUi((s) => s.setDensity);
  const [searchParams, setSearchParams] = useSearchParams();
  const explorer = useMemo(() => parseExplorerParams(searchParams), [searchParams]);
  const {
    q,
    tags,
    status,
    rango,
    ambito,
    yearFrom,
    yearTo,
    jurisdiction,
    department: activeDepartment,
    activeUserTag,
    sort,
  } = explorer;

  const commitExplorer = (patch: Partial<ExplorerUrlState>, replace = false) => {
    const next: ExplorerUrlState = { ...explorer, ...patch };
    setSearchParams(serializeExplorerParams(next), { replace });
  };
  const setQ = (value: string) => commitExplorer({ q: value }, true);
  const setStatus = (value: Set<LawStatus>) => commitExplorer({ status: value });
  const setRango = (value: Set<RangoNormativo>) => commitExplorer({ rango: value });
  const setAmbito = (value: Set<Ambito>) => commitExplorer({ ambito: value });
  const setTags = (value: Set<string>) => commitExplorer({ tags: value });
  const setYearFrom = (value: string) => commitExplorer({ yearFrom: value }, true);
  const setYearTo = (value: string) => commitExplorer({ yearTo: value }, true);
  const setJurisdiction = (value: JurisdictionCode | undefined) => commitExplorer({ jurisdiction: value });
  const setActiveDepartment = (value: string | undefined) => commitExplorer({ department: value });
  const setActiveUserTag = (value: string | null) => commitExplorer({ activeUserTag: value });
  const setSort = (value: LawSort) => commitExplorer({ sort: value });
  const clearFilters = () => setSearchParams(serializeExplorerParams(clearedExplorerState()));
  // Toggled by the empty-state "How to search" button (#476). Surfaces an
  // inline help panel explaining the search syntax instead of a no-op.
  const [showSearchHelp, setShowSearchHelp] = useState(false);

  /**
   * Pull `#tag` tokens out of the free-text input so users can type
   * `#laboral despido` and have it Just Work — Obsidian-style.
   * Inline tags merge with the chip-driven set.
   */
  const { plainQ, allTags } = useMemo(() => {
    const tokens = q.split(/\s+/).filter(Boolean);
    const inline = tokens.filter((t) => t.startsWith('#')).map((t) => t.slice(1).toLowerCase());
    const plain = tokens.filter((t) => !t.startsWith('#')).join(' ');
    return { plainQ: plain, allTags: new Set<string>([...tags, ...inline]) };
  }, [q, tags]);

  const params = useMemo(() => {
    const from = Number.parseInt(yearFrom, 10);
    const to = Number.parseInt(yearTo, 10);
    return {
      q: plainQ || undefined,
      status: status.size ? [...status] : undefined,
      rango: rango.size ? [...rango] : undefined,
      ambito: ambito.size ? [...ambito] : undefined,
      tags: allTags.size ? [...allTags] : undefined,
      yearFrom: Number.isFinite(from) ? from : undefined,
      yearTo: Number.isFinite(to) ? to : undefined,
      jurisdiction,
      department: activeDepartment,
      sort,
    };
  }, [plainQ, status, rango, ambito, allTags, yearFrom, yearTo, jurisdiction, activeDepartment, sort]);

  /**
   * Search mode is active when the user has typed ≥ 2 non-tag characters.
   * In search mode we call the corpus-wide `/laws/search` endpoint with
   * the same facet filters; in browse mode we use the paginated list.
   */
  const isSearchMode = plainQ.trim().length >= 2;

  /**
   * Facets for the corpus search endpoint (#671). Mirror of `listLawsQuery`
   * in transformers — each SPA label is reversed to the backend enum value.
   * The backend accepts single-value filters (first selected item), same as
   * the list endpoint.
   */
  const searchFacets = useMemo((): SearchFacets => {
    const from = Number.parseInt(yearFrom, 10);
    const to = Number.parseInt(yearTo, 10);
    return {
      rank: rango.size
        ? Object.entries(RANK_MAP).find(([, v]) => v === [...rango][0])?.[0]
        : undefined,
      status: status.size
        ? Object.entries(STATUS_MAP).find(([, v]) => v === [...status][0])?.[0]
        : undefined,
      scope: ambito.size
        ? Object.entries(SCOPE_MAP).find(([, v]) => v === [...ambito][0])?.[0]
        : undefined,
      jurisdiction,
      year_from: Number.isFinite(from) ? from : undefined,
      year_to: Number.isFinite(to) ? to : undefined,
      // #671 — official `#tag` filter now flows to the corpus-wide search
      // endpoint (chip + inline `#tag`, AND-matched). Before this the tags
      // were parsed but silently dropped before the request.
      tags: allTags.size ? [...allTags] : undefined,
      // #671 gap B — issuing department (ministerio), same shape as `jurisdiction`.
      department: activeDepartment,
    };
  }, [rango, status, ambito, jurisdiction, yearFrom, yearTo, allTags, activeDepartment]);

  // ── Browse mode (no query) ────────────────────────────────────────────
  const { data: browseData, isLoading: browseLoading } = useLawsList(params, {
    enabled: !isSearchMode,
  });
  const items = useMemo(() => browseData?.items ?? [], [browseData]);

  // #670 — custom user-tag vocabulary + the ids of laws carrying the
  // currently active one. Browse-mode-only facet: it narrows `displayed`
  // via `applyClientFilterSort` below, never `searchFacets` (search mode
  // ignores it — v1 scope).
  const { data: userTagVocab = [] } = useUserTagVocab();
  const { data: userTagLawIdsData } = useUserTagLaws(activeUserTag);
  const userTagLawIds = useMemo(
    () => (activeUserTag ? new Set(userTagLawIdsData ?? []) : null),
    [activeUserTag, userTagLawIdsData],
  );

  // Page-scoped search/sort/tag fallback (#475) — narrows + sorts the loaded
  // page only. Logic + rationale live in `explorer/client-filter-sort.ts`.
  const displayed = useMemo(
    () => applyClientFilterSort(items, { plainQ, allTags, sort, userTagLawIds }),
    [items, plainQ, allTags, sort, userTagLawIds],
  );

  // ── Search mode (query ≥ 2 chars) ─────────────────────────────────────
  const { data: searchData, isLoading: searchLoading } = useSearch(
    isSearchMode ? plainQ : '',
    searchFacets,
  );
  const searchHits = useMemo(() => searchData?.hits ?? [], [searchData]);
  const emptyDescription = useMemo(() => {
    const summary = buildExplorerFilterSummary({
      plainQ,
      status: [...status],
      rango: [...rango],
      ambito: [...ambito],
      tags: [...allTags],
      jurisdiction,
      yearFrom,
      yearTo,
      department: activeDepartment,
      userTag: activeUserTag,
    });
    if (summary.hasFilters) {
      return t('explorer.empty.withFilters', {
        query: plainQ,
        filters: summary.filterLabels.join(', '),
        suggestion: summary.suggestion,
      });
    }
    return t('explorer.empty.description');
  }, [
    plainQ,
    status,
    rango,
    ambito,
    allTags,
    jurisdiction,
    yearFrom,
    yearTo,
    activeDepartment,
    activeUserTag,
    t,
  ]);

  // Unified loading flag for the current mode.
  const isLoading = isSearchMode ? searchLoading : browseLoading;

  const { data: vocab = [] } = useTags();
  // #671 gap B — issuing department (ministerio) vocabulary for the filter rail.
  const { data: departments = [] } = useDepartments();

  // #566 — `#`-triggered tag autocomplete for the search box. When the
  // token under the cursor starts with `#`, suggest matching tags from the
  // live vocabulary so the documented "escribe #tag" hint is discoverable
  // instead of showing nothing.
  const [searchFocused, setSearchFocused] = useState(false);
  const tagSuggestions = useMemo(() => {
    const lastToken = q.split(/\s+/).pop() ?? '';
    if (!lastToken.startsWith('#')) return null;
    const frag = lastToken.slice(1).toLowerCase();
    const matches = vocab
      .filter((v) => v.tag.toLowerCase().includes(frag) && !allTags.has(v.tag))
      .slice(0, 8);
    return matches.length ? matches : null;
  }, [q, vocab, allTags]);
  const completeTag = (tag: string) => {
    const words = q.split(/\s+/);
    words[words.length - 1] = `#${tag}`;
    setQ(words.join(' ') + ' ');
  };

  const rowH = density === 'compact' ? 40 : density === 'cozy' ? 64 : 52;
  const toggle = <T,>(set: Set<T>, v: T) => {
    const next = new Set(set);
    next.has(v) ? next.delete(v) : next.add(v);
    return next;
  };

  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="flex h-full min-h-0">
      <FilterRail
        status={status}
        setStatus={setStatus}
        rango={rango}
        setRango={setRango}
        ambito={ambito}
        setAmbito={setAmbito}
        allTags={allTags}
        setTags={setTags}
        vocab={vocab}
        userTagVocab={userTagVocab}
        activeUserTag={activeUserTag}
        onSelectUserTag={setActiveUserTag}
        yearFrom={yearFrom}
        setYearFrom={setYearFrom}
        yearTo={yearTo}
        setYearTo={setYearTo}
        jurisdiction={jurisdiction}
        setJurisdiction={setJurisdiction}
        departments={departments}
        activeDepartment={activeDepartment}
        onSelectDepartment={setActiveDepartment}
      />

      {/* Mobile filter sheet — same FilterRail wrapped in a slide-in panel
          when `filtersOpen` is true. The desktop rail above is hidden on
          mobile via its own `hidden md:block`. (#36) */}
      {filtersOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('explorer.filters')}
          className="fixed inset-0 z-backdrop bg-black/30 backdrop-blur-[2px] md:hidden"
          onClick={(e) => e.target === e.currentTarget && setFiltersOpen(false)}
        >
          <div className="absolute left-0 top-0 flex h-full w-[80vw] max-w-[320px] flex-col bg-bg shadow-2xl animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="font-display text-base font-semibold">{t('explorer.filters')}</span>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                aria-label={t('explorer.closeFilters')}
                className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-5 scrollbar-thin">
              <FilterRail
                status={status}
                setStatus={setStatus}
                rango={rango}
                setRango={setRango}
                ambito={ambito}
                setAmbito={setAmbito}
                allTags={allTags}
                setTags={setTags}
                vocab={vocab}
                userTagVocab={userTagVocab}
                activeUserTag={activeUserTag}
                onSelectUserTag={setActiveUserTag}
                yearFrom={yearFrom}
                setYearFrom={setYearFrom}
                yearTo={yearTo}
                setYearTo={setYearTo}
                jurisdiction={jurisdiction}
                setJurisdiction={setJurisdiction}
                departments={departments}
                activeDepartment={activeDepartment}
                onSelectDepartment={setActiveDepartment}
                inline
              />
            </div>
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex min-w-0 max-w-content flex-1 flex-col">
        {/* Header */}
        <div className="border-b border-border px-5 pt-4 pb-3.5 md:px-8 md:pt-5">
          <h1 className="mb-3.5 font-display text-2xl font-semibold">{t('explorer.title')}</h1>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[200px] max-w-[480px]">
              <Input
                icon={<Search className="size-3.5" />}
                placeholder={t('explorer.searchPlaceholder')}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                className="w-full"
              />
              {searchFocused && tagSuggestions && (
                <ul className="absolute left-0 right-0 top-full z-dropdown mt-1 max-h-64 overflow-auto rounded-lg border border-border-strong bg-surface p-1 shadow-lg">
                  {tagSuggestions.map(({ tag, count }) => (
                    <li key={tag}>
                      <button
                        type="button"
                        // onMouseDown (not onClick) + preventDefault keeps the
                        // input focused so the selection lands before blur.
                        onMouseDown={(e) => {
                          e.preventDefault();
                          completeTag(tag);
                        }}
                        className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-[13px] hover:bg-surface-2"
                      >
                        <Hash className="size-3 text-muted" />
                        {tag}
                        <span className="ml-auto font-mono text-[10px] text-muted">{count}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Button
              variant="secondary"
              icon={<SlidersHorizontal className="size-3.5" />}
              onClick={() => setFiltersOpen(true)}
              className="md:hidden"
            >
              {t('explorer.filters')}
            </Button>
            <SortButton sort={sort} setSort={setSort} />
            <Tabs variant="segmented" value={density} onChange={(v) => setDensity(v as 'compact' | 'comfortable' | 'cozy')} tabs={[
              { id: 'compact', label: '≡' },
              { id: 'comfortable', label: '≣' },
              { id: 'cozy', label: '☰' },
            ]} />
            <Button variant="secondary" icon={<Download className="size-3.5" />} className="hidden sm:inline-flex">{t('explorer.export')}</Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
            {isSearchMode ? (
              <>
                <span className="font-mono text-fg">{searchHits.length}</span> {t('explorer.countOf')} <span className="font-mono">{searchData?.total ?? 0}</span> {t('explorer.countUnit')}
              </>
            ) : (
              <>
                <span className="font-mono text-fg">{displayed.length}</span> {t('explorer.countOf')} <span className="font-mono">{browseData?.total ?? 0}</span> {t('explorer.countUnit')}
              </>
            )} ·
            {[...status].map((s) => (
              <Chip key={s} dismissable onDismiss={() => setStatus(toggle(status, s))}>{statusLabel(s)}</Chip>
            ))}
            {[...ambito].map((a) => (
              <Chip key={a} dismissable onDismiss={() => setAmbito(toggle(ambito, a))}>{a}</Chip>
            ))}
            {jurisdiction && (
              <Chip dismissable onDismiss={() => setJurisdiction(undefined)}>
                {COMMUNITIES.find((c) => c.code === jurisdiction)?.name ?? jurisdiction}
              </Chip>
            )}
            {activeDepartment && (
              <Chip dismissable onDismiss={() => setActiveDepartment(undefined)}>
                {activeDepartment}
              </Chip>
            )}
            {[...allTags].map((t) => (
              <Chip
                key={t}
                icon={<Hash className="size-3" />}
                dismissable
                onDismiss={() => {
                  const nextTags = new Set(tags);
                  nextTags.delete(t);
                  commitExplorer({
                    tags: nextTags,
                    q: q.split(/\s+/).filter((tok) => tok.toLowerCase() !== '#' + t).join(' '),
                  });
                }}
              >
                {t}
              </Chip>
            ))}
            {activeUserTag && (
              // Custom user-tag filter (#670) — rendered outside the shared
              // `Chip` component (which only styles an indigo `active` tone)
              // so it stays visually distinct amber, matching the LawHeader
              // / FilterRail / CommandPalette user-tag treatment.
              <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-transparent bg-amber-500 pl-2.5 pr-1 text-[12.5px] font-medium text-white">
                {userTagVocab.find((v) => v.tag === activeUserTag)?.label ?? activeUserTag}
                <button
                  type="button"
                  aria-label={t('explorer.removeUserTagFilter', 'quitar filtro de tag')}
                  onClick={() => setActiveUserTag(null)}
                  className="ml-1 flex rounded p-0.5 opacity-70 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                >
                  <X className="size-3" />
                </button>
              </span>
            )}
          </div>
          {isSearchMode && (
            <SearchInterpretationBanner aliasExpansions={searchData?.aliasExpansions} className="mt-2 px-8" />
          )}
        </div>

        {/* Table / Search results */}
        <div className="flex-1 overflow-auto scrollbar-thin">
          {isSearchMode ? (
            /* ── Search mode ────────────────────────────────────────── */
            !isLoading && searchHits.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  title={t('explorer.empty.title')}
                  description={emptyDescription}
                  primaryAction={{ label: t('explorer.clearFilters'), onClick: clearFilters }}
                  secondaryAction={{ label: t('explorer.howToSearch'), onClick: () => setShowSearchHelp((v) => !v) }}
                />
                {showSearchHelp && (
                  <Callout tone="info" title={t('explorer.searchHelp.title')} className="mx-auto mt-4 max-w-md text-left">
                    <ul className="ml-4 list-disc space-y-1">
                      <li>{t('explorer.searchHelp.freetext')}</li>
                      <li>{t('explorer.searchHelp.tags')}</li>
                      <li>{t('explorer.searchHelp.filters')}</li>
                    </ul>
                  </Callout>
                )}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {/* Skeleton rows while search is loading */}
                {isLoading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex flex-col gap-2 px-8 py-4">
                      <Skeleton className="h-3.5 w-1/3" />
                      <Skeleton className="h-2.5 w-2/3" />
                      <Skeleton className="h-2.5 w-1/2" />
                    </div>
                  ))}
                {/* Search result rows */}
                {!isLoading &&
                  searchHits.map((hit) => {
                    const lawId =
                      (typeof hit.payload?.lawId === 'string' ? hit.payload.lawId : undefined) ?? hit.id;
                    const articleNum =
                      hit.articleNumber
                      ?? (typeof hit.payload?.articleNum === 'string' ? hit.payload.articleNum : undefined);
                    const href = lawDetailHref(lawId, articleNum);
                    return (
                      <div
                        key={hit.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(href)}
                        onKeyDown={(e) => e.key === 'Enter' && navigate(href)}
                        className="group flex cursor-pointer items-start gap-3.5 px-8 py-4 transition-colors hover:bg-surface-2/50"
                      >
                        <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-primary-soft text-indigo-700 dark:text-indigo-200">
                          {articleNum ? (
                            <FileText className="size-3.5" />
                          ) : (
                            <BookOpenText className="size-3.5" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="truncate font-semibold leading-snug">{hit.title}</span>
                            {articleNum && (
                              <span className="shrink-0 font-mono text-[11px] text-muted">
                                Art.&nbsp;{articleNum}
                              </span>
                            )}
                          </div>
                          {hit.snippet && (
                            <HighlightedSnippet
                              text={hit.snippet}
                              match={hit.match ?? null}
                              className="mt-1 line-clamp-2 text-[12.5px] text-muted"
                            />
                          )}
                        </div>
                        <ChevronRight className="mt-1 size-3.5 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                    );
                  })}
              </div>
            )
          ) : (
            /* ── Browse mode (no query) ─────────────────────────────── */
            !isLoading && displayed.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  title={t('explorer.empty.title')}
                  description={t('explorer.empty.description')}
                  primaryAction={{ label: t('explorer.clearFilters'), onClick: clearFilters }}
                  secondaryAction={{ label: t('explorer.howToSearch'), onClick: () => setShowSearchHelp((v) => !v) }}
                />
                {showSearchHelp && (
                  <Callout tone="info" title={t('explorer.searchHelp.title')} className="mx-auto mt-4 max-w-md text-left">
                    <ul className="ml-4 list-disc space-y-1">
                      <li>{t('explorer.searchHelp.freetext')}</li>
                      <li>{t('explorer.searchHelp.tags')}</li>
                      <li>{t('explorer.searchHelp.filters')}</li>
                    </ul>
                  </Callout>
                )}
              </div>
            ) : (
              <>
              {/* Mobile (<md): compact card rows — the 7-column desktop table
                  can't fit a phone, so below md we render a card list and the
                  table becomes `hidden md:table` (#826 M2). */}
              <div className="divide-y divide-border md:hidden">
                {displayed.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => navigate(`/laws/${encodeURIComponent(l.id)}`)}
                    className="flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-2/50"
                  >
                    <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-primary-soft text-indigo-700 dark:text-indigo-200">
                      <BookOpenText className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 truncate font-semibold">{l.short}</span>
                        <span className="ml-auto shrink-0">
                          <Badge tone={l.status === 'vigente' ? 'success' : l.status === 'derogada' ? 'danger' : 'amber'}>{statusLabel(l.status)}</Badge>
                        </span>
                      </div>
                      <div className="truncate text-[12px] text-muted">{l.title}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-muted">{l.rango} · {formatDate(l.publicada)}</div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
              <table className="hidden w-full table-fixed border-collapse text-[13.5px] md:table">
                <thead className="sticky top-0 z-sticky bg-bg">
                  <tr className="border-b border-border">
                    <Th className="w-[40%] pl-5 md:pl-8">{t('explorer.cols.law')}</Th>
                    <Th>{t('explorer.cols.status')}</Th>
                    <Th>{t('explorer.cols.rango')}</Th>
                    <Th className="hidden lg:table-cell">{t('explorer.cols.published')}</Th>
                    <Th className="text-right">{t('explorer.cols.articles')}</Th>
                    <Th className="hidden text-right xl:table-cell">{t('explorer.cols.refs')}</Th>
                    <Th className="w-10" />
                  </tr>
                </thead>
                {/* During first-load show skeleton rows shaped like the real
                    data so the table doesn't reflow on hydration. Only fires
                    when we have no items yet — once a page is in cache the
                    refetch happens silently against the stale rows. */}
                {isLoading && items.length === 0 && (
                  <tbody aria-busy>
                    {Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-border" style={{ height: rowH }}>
                        <td className="pl-5 md:pl-8 pr-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <Skeleton className="size-7 shrink-0 rounded-md" />
                            <div className="flex w-full flex-col gap-1.5">
                              <Skeleton className="h-3 w-2/5" />
                              {density !== 'compact' && <Skeleton className="h-2.5 w-3/4" />}
                            </div>
                          </div>
                        </td>
                        <td><Skeleton className="h-4 w-16 rounded-full" /></td>
                        <td><Skeleton className="h-3 w-20" /></td>
                        <td className="hidden lg:table-cell"><Skeleton className="h-3 w-16" /></td>
                        <td className="text-right"><Skeleton className="ml-auto h-3 w-8" /></td>
                        <td className="hidden text-right xl:table-cell"><Skeleton className="ml-auto h-3 w-10" /></td>
                        <td />
                      </tr>
                    ))}
                  </tbody>
                )}
                <tbody>
                  {displayed.map((l) => (
                    <tr
                      key={l.id}
                      onClick={() => navigate(`/laws/${encodeURIComponent(l.id)}`)}
                      className="cursor-pointer border-b border-border transition-colors hover:bg-surface-2/50"
                      style={{ height: rowH }}
                    >
                      <td className={cn('pl-5 md:pl-8 pr-3', density === 'compact' ? 'py-2' : 'py-3')}>
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-primary-soft text-indigo-700 dark:text-indigo-200">
                            <BookOpenText className="size-3.5" />
                          </span>
                          <div className="min-w-0">
                            <div className="truncate font-semibold">{l.short}</div>
                            {density !== 'compact' && (
                              <div className="truncate text-[11.5px] text-muted">{l.title}</div>
                            )}
                            {density === 'cozy' && l.tags && l.tags.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {l.tags.slice(0, 5).map((t) => (
                                  <button
                                    key={t}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const next = new Set(tags);
                                      next.has(t) ? next.delete(t) : next.add(t);
                                      setTags(next);
                                    }}
                                    className="inline-flex items-center gap-0.5 rounded-full bg-primary-soft/60 px-1.5 py-px font-mono text-[10.5px] text-indigo-700 hover:bg-primary-soft dark:text-indigo-200"
                                  >
                                    #{t}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td><Badge tone={l.status === 'vigente' ? 'success' : l.status === 'derogada' ? 'danger' : 'amber'}>{statusLabel(l.status)}</Badge></td>
                      <td className="text-muted">{l.rango}</td>
                      <td className="hidden font-mono text-[12px] text-muted lg:table-cell">{formatDate(l.publicada)}</td>
                      <td className="pr-4 text-right font-mono">{l.articulos}</td>
                      <td className="hidden pr-4 text-right font-mono text-muted xl:table-cell">{formatNumber(l.referencias)}</td>
                      <td className="pr-5"><ChevronRight className="size-3.5 text-muted" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={cn('label-caps whitespace-nowrap px-3 py-2.5 text-left', className)}>
      <span className="inline-flex items-center gap-1">{children}</span>
    </th>
  );
}


// Literal union shared with ``ExplorerPage``'s ``sort`` useState so
// adding a new sort key surfaces as a TS error at the call sites, not as
// a runtime "unknown sort" bug. The pre-refactor signature was
// ``setSort: (v: any) => void`` — proper typing now. Labels resolve via
// `explorer.sort.<key>` in the locale files.
type SortKey = 'relevance' | 'date' | 'refs' | 'title';
const SORT_KEYS: SortKey[] = ['relevance', 'date', 'refs', 'title'];

function SortButton({ sort, setSort }: { sort: SortKey; setSort: (v: SortKey) => void }) {
  const { t } = useTranslation();
  return (
    <select
      value={sort}
      onChange={(e) => setSort(e.target.value as SortKey)}
      className="h-9 rounded-md border border-border-strong bg-surface px-3 text-sm hover:bg-surface-2"
    >
      {SORT_KEYS.map((k) => (
        <option key={k} value={k}>{t(`explorer.sort.${k}`)}</option>
      ))}
    </select>
  );
}
