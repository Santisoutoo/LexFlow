import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { LawStatusBadge } from './LawStatusBadge';
import { formatDate } from '@/lib/utils';

const useSyncStatusMock = vi.fn();

vi.mock('@/lib/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries')>();
  return {
    ...actual,
    useSyncStatus: () => useSyncStatusMock(),
  };
});

function renderBadge(status: 'vigente' | 'derogada' = 'vigente') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LawStatusBadge status={status} />
    </QueryClientProvider>,
  );
}

describe('LawStatusBadge', () => {
  it('shows provenance tooltip with sync date and BOE caveat', () => {
    useSyncStatusMock.mockReturnValue({
      data: { lastSyncAt: '2024-03-05T12:00:00Z', upstream: 'legalize-es@main', behind: 0, busy: false },
    });
    renderBadge();
    const badge = screen.getByText('Vigente');
    const tooltip = badge.getAttribute('title') ?? '';
    expect(tooltip).toMatch(/legalize-es/i);
    expect(tooltip).toContain(formatDate('2024-03-05T12:00:00Z'));
    expect(tooltip).toMatch(/BOE/i);
    expect(badge.getAttribute('aria-label')).toBe(tooltip);
  });

  it('falls back to em dash when sync date is missing', () => {
    useSyncStatusMock.mockReturnValue({
      data: { lastSyncAt: null, upstream: 'legalize-es@main', behind: 0, busy: false },
    });
    renderBadge('derogada');
    const badge = screen.getByText('Derogada');
    const tooltip = badge.getAttribute('title') ?? '';
    expect(tooltip).toContain('—');
  });
});
