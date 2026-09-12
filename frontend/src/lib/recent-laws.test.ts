import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  RECENT_LAWS_CAP,
  RECENT_LAWS_RAIL_COUNT,
  selectRecent,
  useRecentLawsStore,
} from './recent-laws';

beforeEach(() => {
  localStorage.clear();
  useRecentLawsStore.setState({ recent: [] });
});

afterEach(() => {
  localStorage.clear();
  useRecentLawsStore.setState({ recent: [] });
});

describe('useRecentLawsStore', () => {
  it('moves a revisited law to the front without duplicating it', () => {
    const { recordVisit } = useRecentLawsStore.getState();
    recordVisit({ id: 'a', short: 'Ley A' });
    recordVisit({ id: 'b', short: 'Ley B' });
    recordVisit({ id: 'a', short: 'Ley A' });

    expect(useRecentLawsStore.getState().recent.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('caps stored history at RECENT_LAWS_CAP', () => {
    const { recordVisit } = useRecentLawsStore.getState();
    for (let i = 0; i < RECENT_LAWS_CAP + 5; i++) {
      recordVisit({ id: `id-${i}`, short: `S${i}` });
    }

    const recent = useRecentLawsStore.getState().recent;
    expect(recent).toHaveLength(RECENT_LAWS_CAP);
    expect(recent[0]?.id).toBe(`id-${RECENT_LAWS_CAP + 4}`);
    expect(recent[recent.length - 1]?.id).toBe('id-5');
  });

  it('selectRecent returns only the newest N for the rail', () => {
    const { recordVisit } = useRecentLawsStore.getState();
    recordVisit({ id: 'old', short: 'Old' });
    recordVisit({ id: 'mid', short: 'Mid' });
    recordVisit({ id: 'new', short: 'New' });
    recordVisit({ id: 'newest', short: 'Newest' });

    expect(selectRecent(RECENT_LAWS_RAIL_COUNT).map((item) => item.id)).toEqual([
      'newest',
      'new',
      'mid',
    ]);
  });
});
