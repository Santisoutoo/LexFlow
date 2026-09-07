import type { MetricCard } from '@/lib/types';

type DeltaTone = 'outline' | 'success' | 'danger';

export interface DeltaDisplay {
  tone: DeltaTone;
  showIcon: boolean;
  positive: boolean;
}

/** Map a metric card delta to Badge tone and icon visibility. */
export function resolveDeltaDisplay(card: MetricCard): DeltaDisplay {
  const neutral = card.delta === 'estable' || card.delta === 'flat';
  if (neutral) {
    return { tone: 'outline', showIcon: false, positive: false };
  }
  const positive = card.positive ?? card.delta.startsWith('+');
  return {
    tone: positive ? 'success' : 'danger',
    showIcon: true,
    positive,
  };
}
