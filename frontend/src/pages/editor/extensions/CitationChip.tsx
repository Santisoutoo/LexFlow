/**
 * CitationChip — the React NodeView for the `legalCitation` node (#599).
 *
 * Rendered inline inside the editor for every citation. Click toggles a peek
 * popover; "Abrir ley" navigates with the article anchor when present.
 * Ctrl/Cmd+click opens the law in a new tab without leaving the draft.
 */
import { useEffect, useRef, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Scale } from 'lucide-react';
import { Button } from '@/components/ui';
import { useArticle, useLaw } from '@/lib/queries';
import { lawDetailHref } from '@/lib/law-reading';
import { cn } from '@/lib/utils';

/**
 * `contentEditable={false}` keeps ProseMirror from treating the chip internals
 * as editable text, so the click handler fires cleanly.
 */
export function CitationChip({ node }: NodeViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const lawId = node.attrs.lawId as string | null;
  const articleNum = node.attrs.articleNum as string | null;
  const label = (node.attrs.label as string) || lawId || 'Cita';
  const href = lawId ? lawDetailHref(lawId, articleNum) : null;

  const { data: law, isLoading: lawLoading, isError: lawError } = useLaw(lawId ?? undefined);
  const { data: article, isLoading: articleLoading, isError: articleError } = useArticle(
    lawId ?? undefined,
    articleNum ?? undefined,
  );

  const previewLoading = lawLoading || (articleNum ? articleLoading : false);
  const previewError = lawError || (articleNum ? articleError : false);
  const previewTitle = law?.title ?? label;
  const articleText = article?.body.map((clause) => clause.text).join(' ').trim();
  const previewSnippet = articleText?.slice(0, 200) ?? law?.short ?? '';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  const handleChipClick = (e: React.MouseEvent) => {
    if (!lawId || !href) return;
    if (e.metaKey || e.ctrlKey) {
      window.open(href, '_blank', 'noopener,noreferrer');
      return;
    }
    setOpen((prev) => !prev);
  };

  const openLaw = () => {
    if (!href) return;
    navigate(href);
    setOpen(false);
  };

  return (
    <NodeViewWrapper as="span" className="relative inline">
      <button
        ref={buttonRef}
        type="button"
        data-legal-citation=""
        contentEditable={false}
        onClick={handleChipClick}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={t('editor.citationChip.openTitle', { label })}
        className={cn(
          'mx-0.5 inline-flex max-w-[22rem] items-center gap-1 rounded align-baseline',
          'bg-primary-soft px-1.5 py-0.5 text-[0.85em] font-medium leading-snug',
          'text-indigo-700 dark:text-indigo-200',
          'ring-1 ring-inset ring-indigo-300/50 dark:ring-indigo-400/30',
          'transition-colors hover:bg-indigo-100 dark:hover:bg-indigo-500/20',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
          open && 'bg-indigo-100 dark:bg-indigo-500/20',
        )}
      >
        <Scale className="size-3 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </button>

      {open && href && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={t('editor.citationChip.popoverAria', { label })}
          className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-border bg-surface p-3 shadow-lg"
        >
          <div className="space-y-2">
            <div>
              <div className="text-[13px] font-semibold leading-snug">{previewTitle}</div>
              {articleNum && (
                <div className="text-[11.5px] text-muted">
                  {t('editor.citationChip.articleLabel', { num: articleNum })}
                </div>
              )}
            </div>
            {previewLoading && <p className="text-[12px] text-muted">{t('common.loading')}</p>}
            {!previewLoading && previewError && (
              <p className="text-[12px] text-muted">{t('editor.citationChip.previewError')}</p>
            )}
            {!previewLoading && !previewError && previewSnippet && (
              <p className="line-clamp-4 text-[12px] leading-relaxed text-muted">{previewSnippet}</p>
            )}
            <Button variant="secondary" size="sm" className="w-full" icon={<ExternalLink className="size-3.5" />} onClick={openLaw}>
              {t('editor.citationChip.openLaw')}
            </Button>
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
}
