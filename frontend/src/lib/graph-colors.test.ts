import { describe, expect, it } from 'vitest';

import {
  COMMUNITY_NEUTRAL,
  COMMUNITY_PALETTE,
  GRAPH_EDGE_STROKE,
  resolveCommunityFill,
} from './graph-colors';

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

function parseHsl(hsl: string): { h: number; s: number; l: number } {
  const match = hsl.match(/hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  if (!match) throw new Error(`not hsl: ${hsl}`);
  return { h: Number(match[1]), s: Number(match[2]), l: Number(match[3]) };
}

function colorDistance(a: string, b: string): number {
  const pa = parseHsl(a);
  const pb = parseHsl(b);
  const hueDelta = Math.min(Math.abs(pa.h - pb.h), 360 - Math.abs(pa.h - pb.h));
  const satDelta = Math.abs(pa.s - pb.s);
  const lightDelta = Math.abs(pa.l - pb.l);
  return hueDelta + satDelta * 0.35 + lightDelta * 0.65;
}

describe('GRAPH_EDGE_STROKE CVD separation', () => {
  it('keeps edge-kind pairs above a minimum perceptual distance', () => {
    const kinds = Object.keys(GRAPH_EDGE_STROKE) as Array<keyof typeof GRAPH_EDGE_STROKE>;
    const minDistance = 18;
    for (let i = 0; i < kinds.length; i += 1) {
      for (let j = i + 1; j < kinds.length; j += 1) {
        const distance = colorDistance(GRAPH_EDGE_STROKE[kinds[i]], GRAPH_EDGE_STROKE[kinds[j]]);
        expect(distance, `${kinds[i]} vs ${kinds[j]}`).toBeGreaterThanOrEqual(minDistance);
      }
    }
  });
});
