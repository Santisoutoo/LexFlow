import { describe, expect, it } from 'vitest';

import { cloudProviderStatus } from './model-status';

describe('cloudProviderStatus', () => {
  it('shows noKey when no secret is saved', () => {
    expect(cloudProviderStatus('Missing credentials', false)).toEqual({
      statusKey: 'noKey',
      detail: null,
    });
  });

  it('shows keyRejected when the probe reports an auth failure', () => {
    expect(cloudProviderStatus('Anthropic authentication failed', true)).toEqual({
      statusKey: 'keyRejected',
      detail: 'Anthropic authentication failed',
    });
  });

  it('shows probeError for timeouts and other probe failures', () => {
    expect(cloudProviderStatus('Probe timed out', true)).toEqual({
      statusKey: 'probeError',
      detail: 'Probe timed out',
    });
  });

  it('treats missing-credentials errors as noKey even if a secret exists', () => {
    expect(cloudProviderStatus('Missing credentials', true)).toEqual({
      statusKey: 'noKey',
      detail: 'Missing credentials',
    });
  });
});
