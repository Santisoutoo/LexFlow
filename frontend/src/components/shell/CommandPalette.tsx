import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, BookOpenText, FileText, Moon, Network, MessagesSquare, BarChart3, Download, Hash } from 'lucide-react';
import { Button, Kbd } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { useUi } from '@/lib/store';
import { useSearch, useTags, useUserTagVocab } from '@/lib/queries';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { cn } from '@/lib/utils';
import { HighlightedSnippet } from '@/components/domain/HighlightedSnippet';
import { searchHitHref } from '@/lib/law-reading';
import { STATIC_COMMANDS, filterCommands } from './command-palette/commands';

type PaletteGroupId = 'tags' | 'userTags' | 'laws' | 'articles' | 'commands';

interface PaletteItem {
  id: string;
  group: PaletteGroupId;
  icon: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  kbd?: string;
  run: () => void;
}

const GROUP_ORDER: PaletteGroupId[] = ['tags', 'userTags', 'laws', 'articles', 'commands'];

export function CommandPalette() {
  const { t } = useTranslation();
  const paletteOpen = useUi((s) => s.paletteOpen);
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);
  const toggleTheme = useUi((s) => s.toggleTheme);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);

  useFocusTrap(panelRef, paletteOpen);

  useEffect(() => {
    if (paletteOpen) {
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setQ('');
    }
  }, [paletteOpen]);

  useEffect(() => {
    setActive(0);
  }, [q]);

  const trimmedQ = q.trim();
  const { data: searchData, isFetching: searchFetching, isError: searchIsError, error: searchError, refetch: refetchSearch } = useSearch(q);
  const { data: vocab = [] } = useTags();
  const { data: userTagVocab = [] } = useUserTagVocab();

  const groupLabels: Record<PaletteGroupId, string> = useMemo(
    () => ({
      tags: t('commandPalette.groups.tags'),
      userTags: t('commandPalette.groups.userTags'),
      laws: t('commandPalette.groups.laws'),
      articles: t('commandPalette.groups.articles'),
      commands: t('commandPalette.groups.commands'),
    }),
    [t],
  );

  const items: PaletteItem[] = useMemo(() => {
    const m = q.match(/(^|\s)#(\S*)$/);
    const tagQuery = m ? m[2].toLowerCase() : null;
    const tagSuggestions = tagQuery !== null
      ? vocab.filter(({ tag }) => tag.toLowerCase().includes(tagQuery)).slice(0, 6)
      : (q.trim() === '' ? vocab.slice(0, 5) : []);
    const userTagSuggestions = tagQuery !== null
      ? userTagVocab
          .filter(({ tag, label }) => tag.toLowerCase().includes(tagQuery) || label.toLowerCase().includes(tagQuery))
          .slice(0, 6)
      : (q.trim() === '' ? userTagVocab.slice(0, 5) : []);

    const commandExtras: Record<string, { icon: React.ReactNode; run: () => void }> = {
      theme: { icon: <Moon className="size-3.5" />, run: () => { toggleTheme(); setPaletteOpen(false); } },
      'go-graph': { icon: <Network className="size-3.5" />, run: () => { navigate('/graph'); setPaletteOpen(false); } },
      'go-chat': { icon: <MessagesSquare className="size-3.5" />, run: () => { navigate('/chat'); setPaletteOpen(false); } },
      'go-dash': { icon: <BarChart3 className="size-3.5" />, run: () => { navigate('/dashboards'); setPaletteOpen(false); } },
      export: { icon: <Download className="size-3.5" />, run: () => { window.print(); setPaletteOpen(false); } },
    };

    const translatedCommands = STATIC_COMMANDS.map((def) => ({
      ...def,
      title: t(def.titleKey),
    }));

    const commands: PaletteItem[] = filterCommands(translatedCommands, q).map((def) => ({
      id: def.id,
      group: 'commands' as const,
      title: def.title,
      kbd: def.kbd,
      ...commandExtras[def.id],
    }));

    return [
      ...tagSuggestions.map<PaletteItem>(({ tag, count }) => ({
        id: `tag-${tag}`,
        group: 'tags',
        icon: <Hash className="size-3.5" />,
        title: `#${tag}`,
        subtitle: t('commandPalette.tagSubtitle', { count }),
        run: () => { navigate(`/explorer?tags=${encodeURIComponent(tag)}`); setPaletteOpen(false); },
      })),
      ...userTagSuggestions.map<PaletteItem>(({ tag, label, count }) => ({
        id: `user-tag-${tag}`,
        group: 'userTags',
        icon: <Hash className="size-3.5" />,
        title: label,
        subtitle: t('commandPalette.tagSubtitle', { count }),
        run: () => { navigate(`/explorer?userTag=${encodeURIComponent(tag)}`); setPaletteOpen(false); },
      })),
      ...(searchData?.hits ?? []).map<PaletteItem>((h) => ({
        id: h.id,
        group: h.kind === 'law' ? 'laws' : 'articles',
        icon: h.kind === 'law' ? <BookOpenText className="size-3.5" /> : <FileText className="size-3.5" />,
        title: h.title,
        subtitle: h.snippet ? (
          <HighlightedSnippet
            text={h.snippet}
            match={h.match}
            prefix={h.articleNumber ? `Art. ${h.articleNumber} — ` : undefined}
          />
        ) : (
          h.subtitle
        ),
        run: () => {
          const href = searchHitHref(h);
          if (href) navigate(href);
          setPaletteOpen(false);
        },
      })),
      ...commands,
    ];
  }, [q, vocab, userTagVocab, searchData, navigate, toggleTheme, setPaletteOpen, t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!paletteOpen) return;
      if (e.key === 'Escape') { setPaletteOpen(false); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
      if (e.key === 'Enter') { e.preventDefault(); items[active]?.run(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paletteOpen, items, active, setPaletteOpen]);

  if (!paletteOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('commandPalette.ariaLabel')}
      className="fixed inset-0 z-overlay flex items-start justify-center pt-[12vh] bg-black/35 backdrop-blur-[2px] animate-in"
      onClick={() => setPaletteOpen(false)}
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className="air-glass-strong w-[580px] max-w-[92vw] overflow-hidden"
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <Search className="size-4 text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('commandPalette.placeholder')}
            className="flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-muted"
          />
          <Kbd>esc</Kbd>
        </div>

        <div role="listbox" aria-label={t('commandPalette.resultsAria')} className="max-h-[420px] overflow-auto p-2 scrollbar-thin">
          {trimmedQ.length >= 2 && searchFetching && (
            <div className="px-6 py-6 text-center text-sm text-muted">{t('search.searching')}</div>
          )}
          {trimmedQ.length >= 2 && searchIsError && (
            <div className="mx-2 mb-2 rounded-lg border border-danger/30 bg-danger-soft/40 px-4 py-3 text-center">
              <p className="font-mono text-[12px] text-muted">{errorMessage(searchError, t)}</p>
              <Button size="sm" className="mt-2" onClick={() => refetchSearch()}>{t('errors.retry')}</Button>
            </div>
          )}
          {items.length === 0 && !(trimmedQ.length >= 2 && (searchFetching || searchIsError)) && (
            <div className="px-6 py-10 text-center text-sm text-muted">
              {t('commandPalette.noResults', { query: q })}
            </div>
          )}
          {GROUP_ORDER.map((g) => {
            const rows = items.filter((i) => i.group === g);
            if (!rows.length) return null;
            return (
              <div key={g} className="mb-2">
                <div className="label-caps px-2.5 pt-1 pb-1">{groupLabels[g]}</div>
                {rows.map((it) => {
                  const idx = items.indexOf(it);
                  return (
                    <button
                      key={it.id}
                      role="option"
                      aria-selected={active === idx}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => it.run()}
                      className={cn(
                        'flex w-full items-center gap-3 rounded px-2.5 py-2 text-left text-[13.5px] transition-colors',
                        active === idx ? 'bg-primary-soft text-indigo-700 dark:text-indigo-200' : 'text-fg hover:bg-surface-2',
                      )}
                    >
                      <span className={cn(
                        'inline-flex size-6 items-center justify-center rounded',
                        it.group === 'tags' && 'bg-amber-soft text-amber-700 dark:text-amber-300',
                        it.group === 'userTags' && 'bg-amber-soft text-amber-700 dark:text-amber-200',
                        it.group === 'laws' && 'bg-primary-soft text-indigo-700',
                        it.group === 'articles' && 'bg-amber-soft text-amber-700',
                        it.group === 'commands' && 'bg-reference-soft text-reference-soft-fg',
                      )}>{it.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{it.title}</div>
                        {it.subtitle && <div className="truncate text-[12px] text-muted">{it.subtitle}</div>}
                      </div>
                      {it.kbd && <Kbd>{it.kbd}</Kbd>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3.5 border-t border-border px-4 py-2 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1">
            <Kbd>↑</Kbd><Kbd>↓</Kbd> {t('commandPalette.footerNavigate')}
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>↵</Kbd> {t('commandPalette.footerOpen')}
          </span>
          <span className="ml-auto font-mono">{t('commandPalette.resultCount', { count: items.length })}</span>
        </div>
      </div>
    </div>
  );
}
