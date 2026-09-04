/**
 * Persisted pinned law seeds for the graph page (#24).
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface GraphPinsState {
  pinnedLawIds: string[];
  togglePin(lawId: string): void;
  isPinned(lawId: string): boolean;
}

export const useGraphPins = create<GraphPinsState>()(
  persist(
    (set, get) => ({
      pinnedLawIds: [],
      togglePin: (lawId) =>
        set((state) => ({
          pinnedLawIds: state.pinnedLawIds.includes(lawId)
            ? state.pinnedLawIds.filter((id) => id !== lawId)
            : [...state.pinnedLawIds, lawId],
        })),
      isPinned: (lawId) => get().pinnedLawIds.includes(lawId),
    }),
    {
      name: 'lexflow.graph.pins',
      partialize: (state) => ({ pinnedLawIds: state.pinnedLawIds }),
    },
  ),
);
