import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { USER_NAME_STORAGE_KEY } from '@/lib/greeting';
import { TopBar } from './TopBar';

const useChatThreadsMock = vi.fn();

vi.mock('@/lib/queries', () => ({
  useLaw: () => ({ data: undefined }),
  useChatThreads: () => useChatThreadsMock(),
}));

function renderTopBar(path = '/home') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/home" element={<TopBar />} />
          <Route path="/laws/:lawId" element={<TopBar />} />
          <Route path="/graph" element={<TopBar />} />
          <Route path="/chat" element={<TopBar />} />
          <Route path="/chat/:threadId" element={<TopBar />} />
          <Route path="/dashboards" element={<TopBar />} />
          <Route path="/dashboards/:preset" element={<TopBar />} />
          <Route path="/settings" element={<TopBar />} />
          <Route path="/settings/:section" element={<TopBar />} />
          <Route path="/editor" element={<TopBar />} />
          <Route path="/communities" element={<TopBar />} />
          <Route path="/search" element={<TopBar />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  useChatThreadsMock.mockReturnValue({ data: [] });
});

afterEach(() => {
  localStorage.clear();
});

describe('TopBar mobile account menu', () => {
  it('opens the account menu with links to settings, editor, and communities', () => {
    renderTopBar();
    fireEvent.click(screen.getByRole('button', { name: /abrir menú de cuenta|open account menu/i }));
    expect(screen.getByRole('link', { name: /ajustes|settings/i })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('link', { name: /editor/i })).toHaveAttribute('href', '/editor');
    expect(screen.getByRole('link', { name: /comunidades|communities/i })).toHaveAttribute('href', '/communities');
  });
});

describe('TopBar breadcrumbs', () => {
  it('shows Chat plus the thread title instead of the raw path', () => {
    useChatThreadsMock.mockReturnValue({
      data: [{ id: 'abc-123', title: 'EIPD LOPDGDD', updatedAt: '2026-06-01T00:00:00.000Z' }],
    });
    renderTopBar('/chat/abc-123');
    const nav = screen.getByRole('navigation', { name: /migas|breadcrumb/i });
    expect(nav).toHaveTextContent('Chat');
    expect(nav).toHaveTextContent('EIPD LOPDGDD');
    expect(nav).not.toHaveTextContent('chat/abc-123');
  });

  it('shows Cuadros plus the analytics tab label', () => {
    renderTopBar('/dashboards/analytics');
    const nav = screen.getByRole('navigation', { name: /migas|breadcrumb/i });
    expect(nav).toHaveTextContent('Cuadros');
    expect(nav).toHaveTextContent('Analítica');
    expect(nav).not.toHaveTextContent('dashboards/analytics');
  });
});

describe('TopBar avatar', () => {
  it('shows initials from the stored display name, not LV', () => {
    localStorage.setItem(USER_NAME_STORAGE_KEY, 'Victor');
    renderTopBar();
    expect(screen.getByText('VI')).toBeInTheDocument();
    expect(screen.queryByText('LV')).toBeNull();
  });

  it('opens the account menu from the avatar on any viewport', () => {
    renderTopBar();
    fireEvent.click(screen.getByRole('button', { name: /abrir menú de cuenta|open account menu/i }));
    expect(screen.getByRole('dialog', { name: /más|more/i })).toBeInTheDocument();
  });
});

describe('TopBar right-rail toggle', () => {
  it('hides the toggle on rail-less routes', () => {
    renderTopBar('/home');
    expect(screen.queryByRole('button', { name: /alternar panel derecho|toggle right panel/i })).toBeNull();
  });

  it('shows the toggle on law detail and graph', () => {
    const { unmount } = renderTopBar('/laws/CE-1978');
    expect(screen.getAllByRole('button', { name: /alternar panel derecho|toggle right panel/i }).length).toBeGreaterThan(0);
    unmount();
    renderTopBar('/graph');
    expect(screen.getAllByRole('button', { name: /alternar panel derecho|toggle right panel/i }).length).toBeGreaterThan(0);
  });
});
