/**
 * Tests for LawHeader metadata: last_updated formatting and BOE link (#33).
 */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { LawHeader } from './LawHeader';
import type { Law } from '@/lib/types';
import { formatDate } from '@/lib/utils';

vi.mock('@/lib/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries')>();
  return {
    ...actual,
    useSyncStatus: () => ({
      data: { lastSyncAt: '2024-03-05T12:00:00Z', upstream: 'legalize-es@main', behind: 0, busy: false },
    }),
  };
});

const baseLaw: Law = {
  id: 'BOE-A-2018-16673',
  boe: 'BOE-A-2018-16673',
  title: 'Ley Orgánica 3/2018',
  short: 'LOPDGDD',
  status: 'vigente',
  rango: 'Ley Orgánica',
  publicada: '2018-12-06',
  ambito: 'Estatal',
  articulos: 97,
  referencias: 12,
  versiones: 4,
};

function renderHeader(law: Law) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LawHeader law={law} />
    </QueryClientProvider>,
  );
}

describe('LawHeader', () => {
  it('renders the formatted last-modified date and a linked BOE identifier', () => {
    renderHeader({
      ...baseLaw,
      ultimaModificacion: '2024-03-05',
      sourceUrl: 'https://www.boe.es/buscar/act.php?id=BOE-A-2018-16673',
    });

    expect(screen.getByText(formatDate('2024-03-05'))).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /BOE-A-2018-16673/i });
    expect(link).toHaveAttribute('href', 'https://www.boe.es/buscar/act.php?id=BOE-A-2018-16673');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel') ?? '').toMatch(/noopener/);
    expect(link.getAttribute('rel') ?? '').toMatch(/noreferrer/);
    expect(screen.queryByRole('link', { name: /ver en BOE/i })).toBeNull();
  });

  it('shows an em dash when ultimaModificacion is missing', () => {
    renderHeader(baseLaw);
    expect(screen.getByText('Última modificación').nextElementSibling?.textContent).toBe('—');
  });

  it('shows a single status badge and does not label it as Versión', () => {
    renderHeader({ ...baseLaw, status: 'derogada' });
    expect(screen.getAllByText('Derogada')).toHaveLength(1);
    expect(screen.queryByText('Versión')).toBeNull();
  });
});
