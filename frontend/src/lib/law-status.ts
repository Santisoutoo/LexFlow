import type { LawStatus } from './types';

type BadgeTone = 'neutral' | 'primary' | 'amber' | 'success' | 'danger' | 'info' | 'outline';

/** Map a corpus status enum to the shared Badge tone palette. */
export function lawStatusTone(status: LawStatus): BadgeTone {
  if (status === 'vigente') return 'success';
  if (status === 'derogada') return 'danger';
  return 'amber';
}
