/**
 * Account menu — reaches Settings / Editor / Communities.
 *
 * LeftRail is `hidden md:flex` and BottomTabBar is capped at the five
 * primary NAV tabs, so secondary destinations need this overflow sheet.
 * Avatar in TopBar opens it on every viewport.
 *
 * WHERE TO CHANGE IF X CHANGES: destinations live in `MENU_LINKS` below
 * (keep in sync with LeftRail's secondary block). Trigger lives in TopBar.
 */
import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileEdit, MapPin, Settings, X } from 'lucide-react';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { cn } from '@/lib/utils';

const MENU_LINKS = [
  { to: '/settings', labelKey: 'nav.settings', icon: Settings },
  { to: '/editor', labelKey: 'nav.editor', icon: FileEdit },
  { to: '/communities', labelKey: 'nav.communities', icon: MapPin },
] as const;

export function MobileNavMenu({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div>
      <button
        type="button"
        aria-label={t('shell.mobileMenu.closeAria')}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40 animate-in fade-in"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('shell.mobileMenu.title')}
        className={cn(
          'air-glass-strong fixed inset-x-0 bottom-0 z-50 max-h-[78vh] overflow-auto rounded-b-none rounded-t-2xl p-5',
          'pb-[calc(1.25rem+env(safe-area-inset-bottom))] scrollbar-thin',
          'animate-in slide-in-from-bottom duration-200',
        )}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="font-display text-base font-semibold">{t('shell.mobileMenu.title')}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('shell.mobileMenu.closeAria')}
            className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
          >
            <X className="size-4" />
          </button>
        </div>
        <nav aria-label={t('shell.mobileMenu.title')} className="flex flex-col gap-0.5">
          {MENU_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-[13.5px] font-medium transition-colors',
                  isActive ? 'bg-primary-soft text-indigo-700 dark:text-indigo-200' : 'text-fg hover:bg-surface-2',
                )
              }
            >
              <link.icon className="size-[17px]" />
              {t(link.labelKey)}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
