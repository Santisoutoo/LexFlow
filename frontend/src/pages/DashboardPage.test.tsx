import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/lib/types';
import { DashboardPage } from './DashboardPage';

const useDashboardMock = vi.fn();

vi.mock('@/lib/queries', () => ({
  useDashboard: (...args: unknown[]) => useDashboardMock(...args),
}));

function makeDashboard(labels: string[]): DashboardData {
  return {
    preset: 'compliance',
    cards: [
      {
        id: 'c1',
        title: 'Card 1',
        value: '42',
        delta: '+3%',
        spark: [1, 2, 3],
        positive: true,
      },
    ],
    series: {
      labels,
      values: labels.map((_, index) => index + 1),
      recentFrom: 0,
    },
  };
}

function renderDashboard(path = '/dashboards/compliance') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/dashboards" element={<DashboardPage />} />
          <Route path="/dashboards/:preset" element={<DashboardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DashboardPage chart subtitle', () => {
  beforeEach(() => {
    useDashboardMock.mockReset();
  });

  it('derives the chart subtitle range from series labels', () => {
    useDashboardMock.mockReturnValue({ data: makeDashboard(['2018', '2019', '2020']), isLoading: false });
    renderDashboard();
    expect(screen.getByText(/2018 – 2020/i)).toBeInTheDocument();
    expect(screen.getByText(/acumulado|cumulative/i)).toBeInTheDocument();
  });

  it('hides the chart subtitle when series labels are empty', () => {
    useDashboardMock.mockReturnValue({ data: makeDashboard([]), isLoading: false });
    renderDashboard();
    expect(screen.queryByText(/acumulado|cumulative/i)).toBeNull();
  });

  it('keeps preset tabs working', async () => {
    useDashboardMock.mockReturnValue({ data: makeDashboard(['2020']), isLoading: false });
    renderDashboard();
    expect(screen.getByRole('button', { name: /cumplimiento|compliance/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /analítica|analytics/i }));
    expect(useDashboardMock).toHaveBeenCalledWith('analytics');
  });
});
