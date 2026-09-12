/**
 * Pick a Home-page diff target from live list data.
 *
 * The laws list endpoint always reports `versiones: 0` in live mode
 * (`transformers.ts`), so a `versiones >= 2` filter only works against mock
 * payloads. When list counts are missing we probe `/laws/{id}/versions` for
 * the first few candidates and fall back to a known mock-rich id.
 *
 * WHERE TO CHANGE IF X CHANGES: fallback id if LOPDGDD leaves the corpus;
 * probe window if Home's `useLawsList` limit changes.
 */
import { useQueries } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk } from '@/lib/queries';
import type { Law, LawVersion } from '@/lib/types';

/** Mock-rich LOPDGDD — last-resort target when no probed law has ≥2 versions. */
export const FALLBACK_DIFF_LAW_ID = 'BOE-A-2018-16673';

const VERSION_PROBE_LIMIT = 5;
const MIN_DIFF_VERSIONS = 2;

/** First list item that already advertises enough versions (mock / detail-fed). */
export function listedDiffCandidate(candidates: Law[]): Law | undefined {
  return candidates.find((law) => law.versiones >= MIN_DIFF_VERSIONS);
}

/**
 * First probed id whose version timeline is long enough for a diff.
 *
 * Failed or still-pending probes are skipped so a later success can win.
 */
export function firstProbedDiffLawId(
  ids: string[],
  results: ReadonlyArray<{ data: LawVersion[] | undefined; status: string }>,
): string | undefined {
  for (let i = 0; i < ids.length; i++) {
    const result = results[i];
    if (result?.status === 'success' && (result.data?.length ?? 0) >= MIN_DIFF_VERSIONS) {
      return ids[i];
    }
  }
  return undefined;
}

export interface DiffExampleLaw {
  lawId: string;
  isResolving: boolean;
  law: Law | undefined;
}

/**
 * Resolve a law id that has at least two versions, for Home diff shortcuts.
 *
 * `candidates` should be the Home recency list (already fetched). Empty
 * input (still loading) returns the fallback and `isResolving: false` —
 * the caller disables the shortcuts while the list query is in flight.
 */
export function useDiffExampleLaw(candidates: Law[]): DiffExampleLaw {
  const listed = listedDiffCandidate(candidates);
  const probeIds = listed ? [] : candidates.slice(0, VERSION_PROBE_LIMIT).map((law) => law.id);

  const probes = useQueries({
    queries: probeIds.map((id) => ({
      queryKey: qk.laws.versions(id),
      queryFn: () => api.laws.versions(id),
      staleTime: 30 * 60_000,
      enabled: probeIds.length > 0,
    })),
  });

  if (listed) {
    return { lawId: listed.id, isResolving: false, law: listed };
  }

  const probedId = firstProbedDiffLawId(probeIds, probes);
  if (probedId) {
    return {
      lawId: probedId,
      isResolving: false,
      law: candidates.find((candidate) => candidate.id === probedId),
    };
  }

  const probesPending = probes.some((probe) => probe.isPending || probe.isFetching);
  if (probeIds.length > 0 && probesPending) {
    return { lawId: FALLBACK_DIFF_LAW_ID, isResolving: true, law: undefined };
  }

  return {
    lawId: FALLBACK_DIFF_LAW_ID,
    isResolving: false,
    law: candidates.find((candidate) => candidate.id === FALLBACK_DIFF_LAW_ID),
  };
}
