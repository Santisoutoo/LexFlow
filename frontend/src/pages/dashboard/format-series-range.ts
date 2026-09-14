/**
 * Derive a human-readable year range from dashboard series labels.
 *
 * Backend labels are year strings; returns null when the series is empty.
 */
export function formatSeriesRange(labels: string[]): string | null {
  if (labels.length === 0) return null;
  if (labels.length === 1) return labels[0];
  return `${labels[0]} – ${labels[labels.length - 1]}`;
}
