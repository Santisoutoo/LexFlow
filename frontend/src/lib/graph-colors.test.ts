import { describe, expect, it } from 'vitest';

import { COMMUNITY_NEUTRAL, COMMUNITY_PALETTE, resolveCommunityFill } from './graph-colors';

describe('resolveCommunityFill', () => {
  it('returns neutral for missing or zero community', () => {
    expect(resolveCommunityFill(undefined)).toBe(COMMUNITY_NEUTRAL);
    expect(resolveCommunityFill(null)).toBe(COMMUNITY_NEUTRAL);
    expect(resolveCommunityFill(0)).toBe(COMMUNITY_NEUTRAL);
  });

  it('returns stable palette colour per id', () => {
    expect(resolveCommunityFill(1)).toBe(COMMUNITY_PALETTE[1 % COMMUNITY_PALETTE.length]);
    expect(resolveCommunityFill(1)).toBe(resolveCommunityFill(1));
    expect(resolveCommunityFill(15)).toBe(COMMUNITY_PALETTE[15 % COMMUNITY_PALETTE.length]);
  });
});
