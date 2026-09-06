import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { TocEntry } from '@/lib/law-reading';
import { cn } from '@/lib/utils';

export interface LawTocProps {
  items: TocEntry[];
  activeId?: string;
  onNavigate: (targetId: string) => void;
}

const KIND_INDENT: Record<TocEntry['kind'], string> = {
  titulo: 'pl-0 font-semibold',
  libro: 'pl-2',
  capitulo: 'pl-4',
  seccion: 'pl-6',
  articulo: 'pl-8 font-mono text-[12px]',
  disposicion: 'pl-4',
};

/**
 * Sticky table-of-contents for the law texto tab (desktop only).
 */
export function LawToc({ items, activeId, onNavigate }: LawTocProps) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLUListElement>(null);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-toc-item]');
      if (!buttons?.length) return;

      let next = index;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        next = Math.min(index + 1, buttons.length - 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        next = Math.max(index - 1, 0);
      } else if (event.key === 'Home') {
        event.preventDefault();
        next = 0;
      } else if (event.key === 'End') {
        event.preventDefault();
        next = buttons.length - 1;
      } else {
        return;
      }
      buttons[next]?.focus();
    },
    [],
  );

  if (items.length === 0) {
    return (
      <nav
        aria-label={t('lawDetail.toc.label')}
        className="hidden w-56 shrink-0 border-r border-border px-3 py-6 lg:block"
      >
        <p className="text-[12px] text-muted">{t('lawDetail.toc.empty')}</p>
      </nav>
    );
  }

  return (
    <nav
      aria-label={t('lawDetail.toc.label')}
      className="hidden w-56 shrink-0 overflow-auto border-r border-border px-3 py-6 scrollbar-thin lg:sticky lg:top-0 lg:block lg:max-h-full"
    >
      <h2 className="mb-3 label-caps">{t('lawDetail.toc.heading')}</h2>
      <ul ref={listRef} className="space-y-0.5">
        {items.map((item, index) => {
          const isActive = activeId === item.targetId;
          return (
            <li key={item.id}>
              <button
                type="button"
                data-toc-item
                onClick={() => onNavigate(item.targetId)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                className={cn(
                  'w-full rounded px-2 py-1 text-left text-[12.5px] leading-snug hover:bg-surface-2',
                  KIND_INDENT[item.kind],
                  isActive && 'bg-primary-soft text-indigo-700 dark:text-indigo-300',
                )}
              >
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
