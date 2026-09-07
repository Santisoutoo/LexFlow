import { describe, expect, it } from 'vitest';

import { resolveDeltaDisplay } from './delta-tone';
import type { MetricCard } from '@/lib/types';

function card(over: Partial<MetricCard> & Pick<MetricCard, 'delta'>): MetricCard {
  return {
    id: 'x',
    title: 'Test',
    value: '1',
    spark: [1],
    ...over,
  };
}

describe('resolveDeltaDisplay', () => {
  it('uses outline tone for stable deltas', () => {
    expect(resolveDeltaDisplay(card({ delta: 'estable' }))).toEqual({
      tone: 'outline',
      showIcon: false,
      positive: false,
    });
  });

  it('prefers card.positive over delta prefix', () => {
    expect(resolveDeltaDisplay(card({ delta: '-2', positive: true }))).toEqual({
      tone: 'success',
      showIcon: true,
      positive: true,
    });
  });

  it('infers negative tone from delta prefix', () => {
    expect(resolveDeltaDisplay(card({ delta: '-5%' }))).toEqual({
      tone: 'danger',
      showIcon: true,
      positive: false,
    });
  });
});
