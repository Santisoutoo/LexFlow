import { beforeEach, describe, expect, it, vi } from 'vitest';

import { liveSystemApi } from './system';

vi.mock('./http', () => ({
  http: vi.fn(),
  API_BASE: '',
  API_PREFIX: '/api/v1',
  CSRF_HEADER_NAME: 'X-Lexflow-Client',
  CSRF_HEADER_VALUE: 'spa',
}));

import { http } from './http';

describe('liveSystemApi.health', () => {
  beforeEach(() => {
    vi.mocked(http).mockReset();
  });

  it('maps disk.mount from the backend wire shape', async () => {
    vi.mocked(http).mockResolvedValue({
      status: 'ok',
      version: '0.1.0',
      uptime_seconds: 12,
      memory: { rss_mb: 100, system_used_percent: 40 },
      disk: {
        mount: '/',
        total_gb: 100,
        used_gb: 50,
        free_gb: 50,
        used_percent: 50,
      },
      corpus: { submodule_present: true, laws_indexed: 3 },
      chat_db: { reachable: true },
    });

    const snapshot = await liveSystemApi.health();
    expect(snapshot.disk.mount).toBe('/');
  });
});
