/**
 * CommentsPanel — side drawer listing inline document comments (#602).
 *
 * Lists the open document's annotations (active first, resolved muted below).
 * Each card shows the annotated quote, an editable note, and actions: locate
 * (select + scroll to the anchored span), resolve/reopen, delete. The anchor is
 * the `comment` mark carrying the same id; `findCommentRange` maps id → doc range.
 *
 * Right-docked, portaled to <body> by EditorPage (same pattern as AiDraftPanel)
 * so the editor stays interactive.
 */
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Editor } from '@tiptap/react';
import { MessageSquare, X, MapPin, Check, RotateCcw, Trash2, Link2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { toast } from '@/lib/toast';
import { useCommentStore, type DocComment } from '@/lib/comment-store';
import { filterDocComments, findCommentRangeInDoc } from './comment-utils';

interface CommentsPanelProps {
  editor: Editor;
  docId: string;
  /** When set, autofocus this comment's note field (a just-created comment). */
  focusCommentId?: string | null;
  onClose: () => void;
}

/** Find the document range covered by a comment mark, or null if gone. */
function findCommentRange(editor: Editor, commentId: string): { from: number; to: number } | null {
  return findCommentRangeInDoc(editor.state.doc, commentId);
}

export function CommentsPanel({ editor, docId, focusCommentId, onClose }: CommentsPanelProps) {
  const { t } = useTranslation();
  const { comments, updateNote, updateQuote, toggleResolved, deleteComment } = useCommentStore();
  const all = filterDocComments(comments, docId, true);
  const active = all.filter((c) => !c.resolved);
  const resolved = all.filter((c) => c.resolved);

  const focusRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focusCommentId) requestAnimationFrame(() => focusRef.current?.focus());
  }, [focusCommentId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const locate = (id: string) => {
    const range = findCommentRange(editor, id);
    if (range) {
      editor.chain().setTextSelection(range).scrollIntoView().focus().run();
      return;
    }
    toast({
      tone: 'warning',
      title: t('editor.comments.orphanLocateTitle'),
      message: t('editor.comments.orphanLocateBlocked'),
    });
  };

  const resolve = (c: DocComment) => {
    const range = findCommentRange(editor, c.id);
    if (range) {
      editor.chain().setTextSelection(range).setComment({ commentId: c.id, resolved: !c.resolved }).run();
    }
    toggleResolved(c.id);
  };

  const reattach = (c: DocComment) => {
    const { from, to, empty } = editor.state.selection;
    if (empty) {
      toast({
        tone: 'warning',
        title: t('editor.comments.reattachSelectTitle'),
        message: t('editor.comments.reattachSelectHint'),
      });
      return;
    }
    const wasReadOnly = !editor.isEditable;
    if (wasReadOnly) editor.setEditable(true);
    const ok = editor.chain().focus().setComment({ commentId: c.id, resolved: c.resolved }).run();
    if (wasReadOnly) editor.setEditable(false);
    if (!ok) {
      toast({
        tone: 'warning',
        title: t('editor.comments.overlapBlockedTitle'),
        message: t('editor.comments.overlapBlocked'),
      });
      return;
    }
    updateQuote(c.id, editor.state.doc.textBetween(from, to, ' '));
  };

  const remove = (id: string) => {
    const range = findCommentRange(editor, id);
    if (range) editor.chain().setTextSelection(range).unsetComment().run();
    deleteComment(id);
  };

  const renderCard = (c: DocComment) => {
    const anchored = findCommentRange(editor, c.id) !== null;
    return (
    <div key={c.id} className="space-y-2 rounded-lg border border-border bg-bg p-3">
      {!anchored && (
        <p className="rounded bg-muted/40 px-2 py-1 text-[11.5px] font-medium text-muted">
          {t('editor.comments.orphanBanner')}
        </p>
      )}
      <button
        type="button"
        onClick={() => locate(c.id)}
        title={t('editor.comments.locateTitle')}
        className="block w-full border-l-2 border-amber-400 pl-2 text-left text-[12.5px] italic text-muted line-clamp-2 hover:text-fg"
      >
        “{c.quote}”
      </button>
      <textarea
        ref={focusCommentId === c.id ? focusRef : undefined}
        value={c.note}
        onChange={(e) => updateNote(c.id, e.target.value)}
        aria-label={t('editor.comments.noteAria')}
        placeholder={t('editor.comments.notePlaceholder')}
        rows={2}
        className="w-full resize-none rounded border border-border bg-surface px-2 py-1.5 text-[13px] outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-muted"
      />
      <div className="flex flex-wrap items-center gap-1">
        <Button variant="ghost" size="sm" icon={<MapPin className="size-3.5" />} onClick={() => locate(c.id)}>
          {t('editor.comments.locate')}
        </Button>
        {!anchored && (
          <Button variant="ghost" size="sm" icon={<Link2 className="size-3.5" />} onClick={() => reattach(c)}>
            {t('editor.comments.reattach')}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          icon={c.resolved ? <RotateCcw className="size-3.5" /> : <Check className="size-3.5" />}
          onClick={() => resolve(c)}
        >
          {c.resolved ? t('editor.comments.reopen') : t('editor.comments.resolve')}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('editor.comments.deleteAria')}
          title={t('editor.comments.delete')}
          className="ml-auto"
          onClick={() => remove(c.id)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
    );
  };

  return (
    <aside
      role="complementary"
      aria-label={t('editor.comments.panelAria')}
      className="fixed inset-y-0 right-0 z-40 flex w-[340px] max-w-[92vw] flex-col border-l border-border bg-surface shadow-xl"
    >
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <MessageSquare className="size-4 text-amber-600" />
        <span className="flex-1 text-[14px] font-semibold">{t('editor.comments.title')}</span>
        <Button variant="ghost" size="icon-sm" aria-label={t('editor.comments.closeAria')} title={t('editor.comments.close')} onClick={onClose}>
          <X className="size-4" />
        </Button>
      </header>

      <div className="flex-1 space-y-3 overflow-auto p-4 scrollbar-thin">
        {all.length === 0 && (
          <div className="px-2 py-10 text-center text-sm text-muted">
            {t('editor.comments.empty')}
          </div>
        )}
        {active.map(renderCard)}
        {resolved.length > 0 && (
          <div className="space-y-3 pt-1">
            <div className="label-caps">{t('editor.comments.resolvedSection')}</div>
            <div className="space-y-3 opacity-60">{resolved.map(renderCard)}</div>
          </div>
        )}
      </div>
    </aside>
  );
}
