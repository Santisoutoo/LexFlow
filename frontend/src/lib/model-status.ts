/**
 * Pure helpers for cloud provider status labels in Settings (#27).
 *
 * Distinguishes "no key saved" from "key saved but probe rejected" using
 * the backend probe ``error`` string plus the secrets snapshot.
 */

export type CloudProviderStatusKey = 'noKey' | 'keyRejected' | 'probeError';

export interface CloudProviderStatus {
  statusKey: CloudProviderStatusKey;
  /** Probe error detail when the backend returned one. */
  detail: string | null;
}

/**
 * Derive Settings copy for an unavailable cloud provider row.
 *
 * Args:
 *   error: ``ModelInfo.error`` from ``GET /api/v1/models``.
 *   secretConfigured: whether ``GET /api/v1/secrets`` reports a saved key.
 */
export function cloudProviderStatus(
  error: string | null | undefined,
  secretConfigured: boolean,
): CloudProviderStatus {
  if (!secretConfigured) {
    return { statusKey: 'noKey', detail: null };
  }

  const msg = error?.trim() ?? '';
  const lower = msg.toLowerCase();
  if (!msg || lower.includes('missing credentials')) {
    return { statusKey: 'noKey', detail: msg || null };
  }
  if (lower.includes('authentication failed') || lower.includes('invalid api key')) {
    return { statusKey: 'keyRejected', detail: msg };
  }
  return { statusKey: 'probeError', detail: msg };
}
