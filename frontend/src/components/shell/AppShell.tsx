import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { LeftRail } from './LeftRail';
import { BottomTabBar } from './BottomTabBar';
import { TopBar } from './TopBar';
import { CommandPalette } from './CommandPalette';
import { ConfirmProvider } from '@/components/ui';
import { HelpDrawer } from '@/components/domain/HelpDrawer';
import { ErrorBoundary } from './ErrorBoundary';
import { USE_MOCK } from '@/lib/api/http';
import { useUi } from '@/lib/store';
import { useHotkey, useGoToHotkey } from '@/lib/hotkeys';

export function AppShell() {
  const { t } = useTranslation();
  const location = useLocation();
  const togglePalette = useUi((s) => s.togglePalette);
  const toggleRight = useUi((s) => s.toggleRight);
  const toggleLeft = useUi((s) => s.toggleLeft);
  const toggleTheme = useUi((s) => s.toggleTheme);
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);
  const navigate = useNavigate();

  useHotkey('mod+k', (e) => { e.preventDefault(); togglePalette(); });
  useHotkey('mod+/', (e) => { e.preventDefault(); toggleRight(); });
  useHotkey('mod+\\', (e) => { e.preventDefault(); toggleLeft(); });
  useHotkey('mod+.', (e) => { e.preventDefault(); toggleTheme(); });

  useGoToHotkey({
    h: () => navigate('/home'),
    e: () => navigate('/explorer'),
    g: () => navigate('/graph'),
    c: () => navigate('/chat'),
    d: () => navigate('/dashboards'),
    s: () => navigate('/settings'),
  });

  return (
    <ConfirmProvider>
    <div className="flex h-full w-full overflow-hidden bg-bg text-fg">
      <a href="#main" className="skip-link">Saltar al contenido principal</a>
      <LeftRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        {USE_MOCK && (
          <div
            className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-center text-[12px] text-amber-900 dark:text-amber-100"
            data-testid="mock-data-ribbon"
          >
            {t('shell.mockDataRibbon')}
          </div>
        )}
        <main id="main" tabIndex={-1} className="min-h-0 flex-1 overflow-hidden">
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
        {/* Mobile primary nav — in-flow so `main` shrinks above it. */}
        <BottomTabBar />
      </div>
      <CommandPalette />
      {/* Mobile-only floating search/command trigger (desktop uses the TopBar search). */}
      <button
        type="button"
        aria-label="Buscar (paleta de comandos)"
        onClick={() => setPaletteOpen(true)}
        className="fixed bottom-[68px] right-4 z-dropdown flex size-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-2 hover:bg-indigo-500 md:hidden"
      >
        <Search className="size-5" />
      </button>
      {/* #132 — contextual help drawer (desktop-only floating ?). */}
      <HelpDrawer />
    </div>
    </ConfirmProvider>
  );
}
