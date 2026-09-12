import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { TopBar } from './TopBar';

vi.mock('@/lib/queries', () => ({
  useLaw: () => ({ data: undefined }),
}));

function renderTopBar(path = '/home') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <TopBar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TopBar mobile account menu', () => {
  it('opens the account menu with links to settings, editor, and communities', () => {
    renderTopBar();
    fireEvent.click(screen.getByRole('button', { name: /abrir menú de cuenta|open account menu/i }));
    expect(screen.getByRole('link', { name: /ajustes|settings/i })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('link', { name: /editor/i })).toHaveAttribute('href', '/editor');
    expect(screen.getByRole('link', { name: /comunidades|communities/i })).toHaveAttribute('href', '/communities');
  });
});
