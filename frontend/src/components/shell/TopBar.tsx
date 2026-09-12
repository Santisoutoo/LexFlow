import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Search, Moon, Sun, SidebarOpen, SidebarClose, Info } from 'lucide-react';
import { Avatar, Button, Kbd } from '@/components/ui';
import { useUi } from '@/lib/store';
import { useChatThreads, useLaw } from '@/lib/queries';
import { modKey } from '@/lib/utils';
import { hasContextualRightRail } from '@/lib/shell-routes';
import {
  USER_NAME_CHANGED_EVENT,
  displayInitials,
  readStoredUserName,
} from '@/lib/greeting';
import { MobileNavMenu } from './MobileNavMenu';

const DASHBOARD_PRESETS = new Set(['compliance', 'analytics']);

const SETTINGS_SECTION_KEYS = new Set([
  'personalization',
  'appearance',
  'models',
  'mcpServers',
  'data',
  'diagnostics',
  'privacy',
  'help',
  'updates',
  'about',
]);

export function TopBar() {
  const { t } = useTranslation();
  const theme = useUi((s) => s.theme);
  const toggleTheme = useUi((s) => s.toggleTheme);
  const rightOpen = useUi((s) => s.rightOpen);
  const toggleRight = useUi((s) => s.toggleRight);
  const toggleMobileRight = useUi((s) => s.toggleMobileRight);
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ lawId?: string; threadId?: string; preset?: string; section?: string }>();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [storedName, setStoredName] = useState(readStoredUserName);
  const showRightToggle = hasContextualRightRail(location.pathname);
  const initials = displayInitials(storedName);

  useEffect(() => {
    const onChange = () => setStoredName(readStoredUserName());
    window.addEventListener(USER_NAME_CHANGED_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(USER_NAME_CHANGED_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  return (
    <header
      role="banner"
      className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-bg px-4"
    >
      <Breadcrumb
        path={location.pathname}
        lawId={params.lawId}
        threadId={params.threadId}
        preset={params.preset}
        section={params.section}
        navigate={navigate}
      />

      {/* Search trigger — desktop only; mobile uses the floating button in AppShell. */}
      <button
        onClick={() => setPaletteOpen(true)}
        data-tour-id="search-trigger"
        aria-label={t('shell.searchPlaceholder')}
        aria-keyshortcuts="Meta+K Control+K"
        className="ml-auto hidden h-8 w-80 items-center gap-2.5 rounded-lg border border-border-strong bg-surface px-2.5 text-[13px] text-muted transition-colors hover:border-indigo-500/60 hover:text-fg md:inline-flex"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">{t('shell.searchPlaceholder')}</span>
        <Kbd aria-hidden="true">{modKey} K</Kbd>
      </button>

      <Button size="icon" variant="ghost" aria-label={t('shell.toggleTheme')} onClick={toggleTheme} className="ml-auto md:ml-0">
        {theme === 'light' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>
      {showRightToggle && (
        <>
          {/* Desktop dock toggle — hidden on mobile, where the contextual panel is
              a bottom sheet driven by the separate `mobileRightOpen` flag (#826 M3). */}
          <Button size="icon" variant="ghost" aria-label={t('shell.toggleRightPanel')} onClick={toggleRight} className="hidden md:inline-flex">
            {rightOpen ? <SidebarClose className="size-4" /> : <SidebarOpen className="size-4" />}
          </Button>
          {/* Mobile: open the contextual panel as a bottom sheet (closed by default). */}
          <Button size="icon" variant="ghost" aria-label={t('shell.toggleRightPanel')} onClick={toggleMobileRight} className="md:hidden">
            <Info className="size-4" />
          </Button>
        </>
      )}
      <button
        type="button"
        className="rounded-full"
        aria-haspopup="dialog"
        aria-expanded={accountMenuOpen}
        aria-label={t('shell.mobileMenu.openAria')}
        title={storedName ?? undefined}
        onClick={() => setAccountMenuOpen(true)}
      >
        <Avatar initials={initials} size={28} />
      </button>
      {accountMenuOpen && <MobileNavMenu onClose={() => setAccountMenuOpen(false)} />}
    </header>
  );
}

function Breadcrumb({
  path,
  lawId,
  threadId,
  preset,
  section,
  navigate,
}: {
  path: string;
  lawId?: string;
  threadId?: string;
  preset?: string;
  section?: string;
  navigate: (to: string) => void;
}) {
  const { t } = useTranslation();
  // Audit #409 perf: previously fetched the full paginated /laws list
  // (one row per law) just to extract one row's ``short`` name. Now we
  // hit ``/laws/{id}`` directly via ``useLaw`` — single-row payload,
  // dedupes with LawDetailPage's query.
  const { data: law } = useLaw(lawId);
  const { data: threads = [] } = useChatThreads();

  const items: { label: string; onClick?: () => void }[] = [];
  if (path === '/' || path === '/home') items.push({ label: t('nav.home') });
  else if (path === '/explorer') items.push({ label: t('nav.explorer') });
  else if (path.startsWith('/laws/') && path.endsWith('/diff')) {
    items.push({ label: t('nav.explorer'), onClick: () => navigate('/explorer') });
    if (law) items.push({ label: law.short, onClick: () => navigate(`/laws/${encodeURIComponent(law.id)}`) });
    items.push({ label: t('shell.diff') });
  } else if (path.startsWith('/laws/')) {
    items.push({ label: t('nav.explorer'), onClick: () => navigate('/explorer') });
    if (law) items.push({ label: law.short });
  } else if (path === '/graph') items.push({ label: t('nav.graph') });
  else if (path === '/chat' || path.startsWith('/chat/')) {
    items.push({ label: t('nav.chat'), onClick: threadId ? () => navigate('/chat') : undefined });
    if (threadId) {
      const title = threads.find((th) => th.id === threadId)?.title ?? t('chat.threadFallback');
      items.push({ label: title });
    }
  } else if (path === '/dashboards' || path.startsWith('/dashboards/')) {
    items.push({ label: t('nav.dashboards'), onClick: preset ? () => navigate('/dashboards') : undefined });
    if (preset && DASHBOARD_PRESETS.has(preset)) {
      items.push({ label: t(`dashboards.tabs.${preset}`) });
    }
  } else if (path === '/settings' || path.startsWith('/settings/')) {
    items.push({ label: t('nav.settings'), onClick: section ? () => navigate('/settings') : undefined });
    if (section && SETTINGS_SECTION_KEYS.has(section)) {
      items.push({ label: t(`settings.sections.${section}`) });
    }
  } else if (path === '/communities' || path.startsWith('/communities/')) {
    items.push({ label: t('nav.communities', 'Comunidades') });
  } else if (path === '/editor' || path.startsWith('/editor/')) {
    items.push({ label: t('nav.editor') });
  } else if (path === '/search' || path.startsWith('/search/')) {
    items.push({ label: t('search.title') });
  } else items.push({ label: path.slice(1) });

  return (
    <nav aria-label={t('shell.breadcrumb')} className="flex min-w-0 items-center gap-1.5 text-[13px]">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="size-3.5 text-muted" />}
          {it.onClick ? (
            <button onClick={it.onClick} className="text-muted hover:text-fg">{it.label}</button>
          ) : (
            <span className="font-semibold">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
