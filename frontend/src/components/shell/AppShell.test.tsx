import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from './AppShell';
import { useUi } from '@/lib/store';

vi.mock('./LeftRail', () => ({ LeftRail: () => null }));
vi.mock('./BottomTabBar', () => ({ BottomTabBar: () => null }));
vi.mock('./TopBar', () => ({ TopBar: () => null }));
vi.mock('./CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('@/components/domain/HelpDrawer', () => ({ HelpDrawer: () => null }));

vi.mock('@/lib/api/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/http')>();
  return { ...actual, USE_MOCK: true };
});

describe('AppShell mock data ribbon', () => {
  it('shows demo ribbon when USE_MOCK is enabled', () => {
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('mock-data-ribbon')).toHaveTextContent(/demostración|demo data/i);
  });
});

describe('AppShell right-rail hotkey', () => {
  beforeEach(() => {
    useUi.setState({ rightOpen: true });
  });

  it('does not flip rightOpen with mod+/ on rail-less routes', () => {
    render(
      <MemoryRouter initialEntries={['/home']}>
        <AppShell />
      </MemoryRouter>,
    );
    fireEvent.keyDown(window, { key: '/', metaKey: true });
    expect(useUi.getState().rightOpen).toBe(true);
  });

  it('toggles rightOpen with mod+/ on graph', () => {
    render(
      <MemoryRouter initialEntries={['/graph']}>
        <AppShell />
      </MemoryRouter>,
    );
    fireEvent.keyDown(window, { key: '/', metaKey: true });
    expect(useUi.getState().rightOpen).toBe(false);
  });
});
