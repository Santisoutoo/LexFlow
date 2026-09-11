import { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/shell/AppShell';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { Skeleton } from '@/components/domain/Skeleton';
import { usePageViewTelemetry } from '@/lib/telemetry';
import { useUi } from '@/lib/store';

// Audit #409 / #712 perf: every page is lazy-loaded so the cold-start entry
// bundle stays small (it previously dragged the chat stack, react-flow, the
// model wizard, the dashboards charts AND four eager pages — incl.
// react-markdown via LawDetailPage — into the entry chunk). The four most
// common landing surfaces (Home, Explorer, LawDetail) are PREFETCHED
// the moment the command palette opens (see the effect in `App`), so Cmd-K
// navigation still feels instant despite being lazy.
const HomePage = lazy(() => import('@/pages/HomePage').then((m) => ({ default: m.HomePage })));
const ExplorerPage = lazy(() => import('@/pages/ExplorerPage').then((m) => ({ default: m.ExplorerPage })));
const LawDetailPage = lazy(() => import('@/pages/LawDetailPage').then((m) => ({ default: m.LawDetailPage })));
const SearchRedirect = lazy(() => import('@/pages/SearchRedirect').then((m) => ({ default: m.SearchRedirect })));
const DiffPage = lazy(() => import('@/pages/DiffPage').then((m) => ({ default: m.DiffPage })));
const GraphPage = lazy(() => import('@/pages/GraphPage').then((m) => ({ default: m.GraphPage })));
const ChatPage = lazy(() => import('@/pages/ChatPage').then((m) => ({ default: m.ChatPage })));
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
// Milestone 14 — document editor (TipTap). Lazy-loaded because the TipTap
// + ProseMirror bundle is non-trivial and the editor is an opt-in surface.
const EditorPage = lazy(() => import('@/pages/EditorPage').then((m) => ({ default: m.EditorPage })));
// #671 gap C — browse-by-autonomous-community directory. Lazy like every
// other route; it's a secondary entry point, not part of the hot path.
const CommunitiesPage = lazy(() => import('@/pages/CommunitiesPage').then((m) => ({ default: m.CommunitiesPage })));

function PageFallback() {
  return (
    <div className="flex h-full items-center justify-center p-12">
      <Skeleton className="h-8 w-32" />
    </div>
  );
}

// The marketing landing lives in a completely separate Vite project under
// ../landing — it has its own build, deps and GitHub Pages deploy. The SPA
// owns only the application surface; `/` redirects to the home dashboard.
export function App() {
  // Page-view telemetry — no-op unless both gates (operator env +
  // user Zustand consent) are on. Lives inside ``BrowserRouter`` so
  // ``useLocation`` resolves.
  usePageViewTelemetry();
  // #712 perf — prefetch the common Cmd-K destinations as soon as the palette
  // opens, so navigating to them from search is instant even though the routes
  // are now lazy. Same module specifiers as the lazy() calls → warms the chunk.
  const paletteOpen = useUi((s) => s.paletteOpen);
  useEffect(() => {
    if (!paletteOpen) return;
    void import('@/pages/ExplorerPage');
    void import('@/pages/LawDetailPage');
  }, [paletteOpen]);
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />

        <Route element={<AppShell />}>
          <Route path="home" element={<HomePage />} />
          <Route path="explorer" element={<ExplorerPage />} />
          <Route path="communities" element={<CommunitiesPage />} />
          <Route path="laws/:lawId" element={<LawDetailPage />} />
          <Route path="laws/:lawId/diff" element={<DiffPage />} />
          <Route path="graph" element={<GraphPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="chat/:threadId" element={<ChatPage />} />
          <Route path="dashboards" element={<DashboardPage />} />
          <Route path="dashboards/:preset" element={<DashboardPage />} />
          <Route path="search" element={<SearchRedirect />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/:section" element={<SettingsPage />} />
          <Route path="editor" element={<EditorPage />} />
          <Route path="editor/:docId" element={<EditorPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </Suspense>
  );
}
