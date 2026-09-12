/**
 * Persisted recently-visited laws for the LeftRail "Reciente" list.
 *
 * Visit tracking is local-only (Zustand + persist). It is not telemetry —
 * recording a law happens when LawDetailPage loads it successfully.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Maximum laws kept in the visit history. */
export const RECENT_LAWS_CAP = 20;

/** How many recent laws the LeftRail shows. */
export const RECENT_LAWS_RAIL_COUNT = 3;

export interface RecentLaw {
  id: string;
  short: string;
  visitedAt: string;
}

interface RecentLawsState {
  recent: RecentLaw[];
  recordVisit(law: { id: string; short: string }): void;
}

function prependVisit(recent: RecentLaw[], law: { id: string; short: string }): RecentLaw[] {
  const entry: RecentLaw = {
    id: law.id,
    short: law.short,
    visitedAt: new Date().toISOString(),
  };
  return [entry, ...recent.filter((item) => item.id !== law.id)].slice(0, RECENT_LAWS_CAP);
}

export const useRecentLawsStore = create<RecentLawsState>()(
  persist(
    (set) => ({
      recent: [],
      recordVisit: (law) => set((state) => ({ recent: prependVisit(state.recent, law) })),
    }),
    {
      name: 'lexflow.recent-laws',
      partialize: (state) => ({ recent: state.recent }),
    },
  ),
);

/** Slice the stored history to the N most recently visited laws. */
export function selectRecent(max: number): RecentLaw[] {
  return useRecentLawsStore.getState().recent.slice(0, max);
}
