import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Law, LawVersion } from '@/lib/types';
import { HomePage } from './HomePage';
import { FALLBACK_DIFF_LAW_ID } from './home/use-diff-example-law';

const useLawsListMock = vi.fn();
const useSyncStatusMock = vi.fn();
const versionsMock = vi.fn();

vi.mock('@/lib/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries')>();
  return {
    ...actual,
    useLawsList: (...args: unknown[]) => useLawsListMock(...args),
    useSyncStatus: () => useSyncStatusMock(),
    useTags: () => ({ data: [] }),
  };
});

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      laws: {
        ...actual.api.laws,
        versions: (...args: unknown[]) => versionsMock(...args),
      },
    },
  };
});

function makeLaw(id: string, versiones: number): Law {
  return {
    id,
    boe: id,
    title: `Law ${id}`,
    short: `Short ${id}`,
    status: 'vigente',
    rango: 'Ley',
    publicada: '2024-01-01',
    ambito: 'Estatal',
    articulos: 10,
    referencias: 0,
    versiones,
    tags: [],
  };
}

function version(tag: string): LawVersion {
  return { tag, date: '2024-01-01', label: tag, kind: 'publish' };
}

function DiffTarget() {
  const { lawId } = useParams();
  return <div data-testid="diff-target">{lawId}</div>;
}

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route path="/home" element={<HomePage />} />
          <Route path="/laws/:lawId/diff" element={<DiffTarget />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('HomePage sync banner', () => {
  beforeEach(() => {
    useLawsListMock.mockReturnValue({ data: { items: [] }, isLoading: false });
    versionsMock.mockReset();
    versionsMock.mockResolvedValue([]);
  });

  it('shows up-to-date copy when behind is zero', () => {
    useSyncStatusMock.mockReturnValue({
      data: { behind: 0, upstream: 'legalize-es@main', lastSyncAt: '2024-03-05T12:00:00Z', busy: false },
      isError: false,
      isLoading: false,
    });
    renderHome();
    expect(screen.getByText(/El corpus está al día\. Última sincronización/i)).toBeInTheDocument();
  });

  it('shows pending commits when behind is greater than zero', () => {
    useSyncStatusMock.mockReturnValue({
      data: { behind: 3, upstream: 'legalize-es@main', lastSyncAt: '2024-03-05T12:00:00Z', busy: false },
      isError: false,
      isLoading: false,
    });
    renderHome();
    expect(screen.getByText(/3 commits pendientes/i)).toBeInTheDocument();
    expect(screen.queryByText(/El corpus está al día\. Última sincronización/i)).toBeNull();
  });

  it('shows unknown copy on sync query failure', () => {
    useSyncStatusMock.mockReturnValue({ data: undefined, isError: true, isLoading: false });
    renderHome();
    expect(screen.getByText(/estado de sincronización desconocido/i)).toBeInTheDocument();
  });
});

describe('HomePage diff targets', () => {
  beforeEach(() => {
    versionsMock.mockReset();
    useLawsListMock.mockReset();
    useSyncStatusMock.mockReturnValue({ data: undefined, isError: false, isLoading: false });
  });

  it('uses a list item with versiones ≥ 2 without probing other ids', async () => {
    useLawsListMock.mockReturnValue({
      data: { items: [makeLaw('BOE-A-1', 0), makeLaw('BOE-A-RICH', 4)] },
      isLoading: false,
    });
    versionsMock.mockResolvedValue([version('v1.3'), version('v1.0')]);
    renderHome();

    await userEvent.click(screen.getByRole('button', { name: /comparar versiones/i }));
    expect(await screen.findByTestId('diff-target')).toHaveTextContent('BOE-A-RICH');
    const probedOthers = versionsMock.mock.calls.some(([id]) => id === 'BOE-A-1');
    expect(probedOthers).toBe(false);
  });

  it('probes /versions and navigates to the first law with two tags', async () => {
    useLawsListMock.mockReturnValue({
      data: { items: [makeLaw('BOE-A-SHORT', 0), makeLaw('BOE-A-PROBE', 0)] },
      isLoading: false,
    });
    versionsMock.mockImplementation(async (id: string) => {
      if (id === 'BOE-A-PROBE') return [version('v2'), version('v1')];
      return [version('v1')];
    });
    renderHome();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /comparar versiones/i })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole('button', { name: /comparar versiones/i }));
    expect(await screen.findByTestId('diff-target')).toHaveTextContent('BOE-A-PROBE');
    expect(screen.getByTestId('diff-target')).not.toHaveTextContent(FALLBACK_DIFF_LAW_ID);
  });

  it('falls back to the mock-rich LOPDGDD id when every probe is empty', async () => {
    useLawsListMock.mockReturnValue({
      data: { items: [makeLaw('BOE-A-EMPTY', 0)] },
      isLoading: false,
    });
    versionsMock.mockResolvedValue([]);
    renderHome();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /comparar versiones/i })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole('button', { name: /comparar versiones/i }));
    expect(await screen.findByTestId('diff-target')).toHaveTextContent(FALLBACK_DIFF_LAW_ID);
  });
});
