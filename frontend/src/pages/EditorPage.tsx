/**
 * EditorPage — document editor route (`/editor` and `/editor/:docId`).
 *
 * Provides a TipTap rich-text editor with:
 * - StarterKit (paragraph, headings, bold, italic, lists, blockquote,
 *   horizontal rule, code, undo/redo — all via a single extension).
 * - A floating toolbar (EditorToolbar) for the subset of controls
 *   exposed in the UI.
 * - Local-first persistence via `useEditorStore` (Zustand + localStorage).
 *   Content is autosaved ~600 ms after the last keystroke (debounced).
 * - A read/edit toggle that calls `editor.setEditable(boolean)`.
 * - An inline-editable title bound to the persisted document.
 *
 * Invariants:
 * - The editor is always mounted with `immediatelyRender: true` (CSR only).
 * - A pending debounce is flushed immediately on unmount, doc switch (the
 *   keyed surface unmounts), tab hide (`visibilitychange`), and `beforeunload`,
 *   so the last keystrokes persist instead of being cancelled.
 * - `docId` is required on `/editor/:docId`. Bare `/editor` renders the
 *   document picker so the user can create or switch documents (#57 S1.4).
 * - The TipTap instance remounts per `docId` (`key={docId}`) so each
 *   document gets a fresh undo stack and loads via `useEditor({ content })`
 *   without a follow-up `setContent` (which would be undoable and would
 *   emit `onUpdate`, scheduling a redundant save).
 *
 * --- WHERE TO CHANGE IF EDITOR FEATURES CHANGE ---
 * - Add a new TipTap extension → install it, add to `extensions` below,
 *   and add its toolbar button in `EditorToolbar.tsx`.
 * - Change the autosave delay → update `AUTOSAVE_DELAY_MS`.
 * - Switch from localStorage to server sync → update `useEditorStore`.
 */
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useEditorStore, makeDefaultDocument, isSentinelDocumentTitle } from '@/lib/editor-store';
import { toast } from '@/lib/toast';
import { exportMarkdown } from '@/pages/editor/export-utils';
import { EditorToolbar } from '@/pages/editor/EditorToolbar';
import { CitationPicker } from '@/pages/editor/CitationPicker';
import { TemplatesDialog } from '@/pages/editor/TemplatesDialog';
import { AiDraftPanel } from '@/pages/editor/AiDraftPanel';
import { CommentsPanel } from '@/pages/editor/CommentsPanel';
import { ExportMenu } from '@/pages/editor/ExportMenu';
import { LegalCitation } from '@/pages/editor/extensions/LegalCitation';
import { CommentMark } from '@/pages/editor/extensions/CommentMark';
import { AiGeneratedMark } from '@/pages/editor/extensions/AiGeneratedMark';
import { PendingInsertHighlight } from '@/pages/editor/extensions/PendingInsertHighlight';
import { useCommentStore } from '@/lib/comment-store';
import { cn } from '@/lib/utils';
import { DocumentList, DocumentPicker } from '@/pages/editor/DocumentList';

/** Debounce window before a content change is written to localStorage (ms). */
const AUTOSAVE_DELAY_MS = 600;

type SaveStatus = 'saved' | 'saving' | 'unsaved';

/** Cancel any pending debounce and write the latest editor state immediately (#44 R5). */
function flushPendingAutosave(
  autosaveTimer: MutableRefObject<ReturnType<typeof setTimeout> | null>,
  editor: Editor | null,
  docIdRef: MutableRefObject<string>,
  titleRef: MutableRefObject<string>,
  saveDocument: (doc: { id: string; title: string; content: ReturnType<Editor['getJSON']> }) => void,
  /** When switching docs, pass the outgoing id — `docIdRef` may already point at the new route. */
  docIdOverride?: string,
): boolean {
  if (autosaveTimer.current === null) return false;
  clearTimeout(autosaveTimer.current);
  autosaveTimer.current = null;
  if (!editor) return false;
  saveDocument({
    id: docIdOverride ?? docIdRef.current,
    title: titleRef.current,
    content: editor.getJSON(),
  });
  return true;
}

function clearAutosaveTimer(autosaveTimer: MutableRefObject<ReturnType<typeof setTimeout> | null>): void {
  if (autosaveTimer.current === null) return;
  clearTimeout(autosaveTimer.current);
  autosaveTimer.current = null;
}

/**
 * EditorPage renders the document picker at `/editor` and the workspace
 * at `/editor/:docId`.
 */
export function EditorPage() {
  const { docId } = useParams<{ docId?: string }>();
  if (!docId) return <DocumentPicker />;
  return <EditorWorkspace docId={docId} />;
}

function intlLocale(language: string): string {
  return language.startsWith('en') ? 'en-GB' : 'es-ES';
}

/**
 * Shell around a single document: sidebar list stays mounted across
 * switches; the TipTap surface remounts per `docId` (S1.2).
 */
function EditorWorkspace({ docId }: { docId: string }) {
  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-56 shrink-0 flex-col overflow-auto border-r border-border p-3 md:flex">
        <DocumentList activeId={docId} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-auto p-6">
        <div className="border-b border-border pb-3 md:hidden">
          <DocumentList activeId={docId} />
        </div>
        <EditorDocumentSurface key={docId} docId={docId} />
      </div>
    </div>
  );
}

/**
 * Per-document TipTap instance, autosave lifecycle, toolbar, and panels.
 *
 * Mounted with `key={docId}` so switching documents destroys the previous
 * editor (flushing a pending debounce via unmount cleanup) and creates a
 * new one with the incoming JSON as initial `content` — no `setContent`,
 * no undo history bleed, no save-on-load.
 */
function EditorDocumentSurface({ docId }: { docId: string }) {
  const { t, i18n } = useTranslation();

  const { getDocument, saveDocument, persistError, clearPersistError } = useEditorStore();

  // Resolve the document from the store; create a default stub if new.
  const stored = getDocument(docId);
  const initialDoc = stored ?? makeDefaultDocument(docId);

  // Local title state — synced to the store on every change alongside content.
  const [title, setTitle] = useState<string>(initialDoc.title);

  // Whether the editor is in read-only (preview) mode.
  const [isReadOnly, setIsReadOnly] = useState<boolean>(false);

  // Whether the corpus citation picker is open (#599).
  const [citationPickerOpen, setCitationPickerOpen] = useState<boolean>(false);

  // Whether the template library is open (#600).
  const [templatesOpen, setTemplatesOpen] = useState<boolean>(false);

  // Whether the AI drafting assistant panel is open (#601).
  const [aiPanelOpen, setAiPanelOpen] = useState<boolean>(false);

  // Comments side panel (#602): open state + the comment to autofocus on open.
  const [commentsOpen, setCommentsOpen] = useState<boolean>(false);
  const [focusCommentId, setFocusCommentId] = useState<string | null>(null);
  const addComment = useCommentStore((s) => s.addComment);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');

  // Ref to hold the active autosave timeout so it can be flushed on unmount.
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `useEditor`'s `onUpdate` closes over the values at creation time, so the
  // debounced save must read the CURRENT docId/title from refs — otherwise a
  // queued save can write content under a stale id or roll back a newer title
  // (#598 review).
  const docIdRef = useRef(docId);
  const titleRef = useRef(title);
  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  const editor = useEditor({
    extensions: [
      // StarterKit includes: Document, Paragraph, Text, Bold, Italic,
      // Strike, Code, Heading (levels 1-6), BulletList, OrderedList,
      // ListItem, Blockquote, HorizontalRule, HardBreak, History (undo/redo),
      // Dropcursor, Gapcursor.
      StarterKit,
      // Empty-state hint. Sets `is-editor-empty` + `data-placeholder` on the
      // first empty paragraph; the CSS that renders it lives in the editor
      // container below (`is-editor-empty:first-child::before`).
      Placeholder.configure({ placeholder: t('editor.contentPlaceholder') }),
      // Typed, corpus-resolved legal citations (#599). Inserted via CitationPicker.
      LegalCitation,
      // Inline comment anchors (#602). The note text lives in comment-store.
      CommentMark,
      AiGeneratedMark,
      PendingInsertHighlight,
    ],
    content: initialDoc.content,
    editable: !isReadOnly,
    immediatelyRender: true,
    onUpdate: ({ editor: ed }) => {
      if (autosaveTimer.current !== null) {
        clearTimeout(autosaveTimer.current);
      }
      setSaveStatus('unsaved');
      autosaveTimer.current = setTimeout(() => {
        autosaveTimer.current = null;
        setSaveStatus('saving');
        saveDocument({
          id: docIdRef.current,
          title: titleRef.current,
          content: ed.getJSON(),
        });
        setSaveStatus('saved');
      }, AUTOSAVE_DELAY_MS);
    },
  });

  // Flush pending edits on unmount so keystrokes inside the debounce window survive (#44 R5).
  useEffect(() => {
    return () => {
      flushPendingAutosave(autosaveTimer, editor, docIdRef, titleRef, saveDocument);
    };
  }, [editor, saveDocument]);

  // Tab close / background: same flush as unmount, without cancelling the timer.
  useEffect(() => {
    const flushIfPending = () =>
      flushPendingAutosave(autosaveTimer, editor, docIdRef, titleRef, saveDocument);

    const onBeforeUnload = () => {
      flushIfPending();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return;
      if (flushIfPending()) setSaveStatus('saved');
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [editor, saveDocument]);

  // Sticky warning when localStorage quota is exceeded — export is the escape hatch.
  useEffect(() => {
    if (!persistError) return;
    toast({
      tone: 'warning',
      title: t('editor.persistErrorTitle'),
      message: t('editor.persistErrorBody'),
      ttlMs: 0,
    });
  }, [persistError, t]);

  // Sync the `editable` flag whenever the toggle changes.
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!isReadOnly);
  }, [editor, isReadOnly]);

  // Keep the TipTap placeholder in sync when the UI language changes.
  useEffect(() => {
    if (!editor?.extensionManager) return;
    const extension = editor.extensionManager.extensions.find((ext) => ext.name === 'placeholder');
    if (!extension) return;
    extension.options.placeholder = t('editor.contentPlaceholder');
    editor.view.dispatch(editor.state.tr);
  }, [editor, t, i18n.language]);

  /** Flush the title change to the store immediately (no debounce needed — titles are short). */
  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTitle = e.target.value;
      setTitle(newTitle);
      if (!editor) return;
      clearAutosaveTimer(autosaveTimer);
      saveDocument({
        id: docId,
        title: newTitle,
        content: editor.getJSON(),
      });
      setSaveStatus('saved');
    },
    [docId, editor, saveDocument]
  );

  const handleToggleReadOnly = useCallback(() => {
    setIsReadOnly((prev) => !prev);
  }, []);

  /**
   * Comment the current selection (#602): snapshot the quote, anchor a
   * `comment` mark over it, store the (empty) note, then open the panel
   * focused on the new comment so the user types the note straight away.
   */
  const handleAddComment = useCallback(() => {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    if (empty) return;
    const quote = editor.state.doc.textBetween(from, to, ' ');
    const commentId = crypto.randomUUID();
    editor.chain().focus().setComment({ commentId, resolved: false }).run();
    addComment({ id: commentId, docId, quote, note: '' });
    setFocusCommentId(commentId);
    setCommentsOpen(true);
  }, [editor, docId, addComment]);

  const handleEmergencyExport = useCallback(() => {
    if (!editor) return;
    exportMarkdown(editor.getJSON(), title);
  }, [editor, title]);

  return (
    <>
      {persistError && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[12.5px] text-amber-900 dark:text-amber-100"
          data-testid="editor-persist-error-banner"
        >
          <p>{t('editor.persistErrorBody')}</p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={handleEmergencyExport}
              className="rounded px-2 py-1 text-[11px] font-medium hover:bg-amber-500/20"
            >
              {t('editor.persistErrorExport')}
            </button>
            <button
              type="button"
              onClick={clearPersistError}
              className="rounded px-2 py-1 text-[11px] hover:bg-amber-500/20"
              aria-label={t('editor.persistErrorDismiss')}
            >
              {t('editor.persistErrorDismiss')}
            </button>
          </div>
        </div>
      )}
      {/* Page header: editable title + save status, export on the right */}
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <input
            type="text"
            value={isSentinelDocumentTitle(title) ? '' : title}
            onChange={handleTitleChange}
            readOnly={isReadOnly}
            aria-label={t('editor.documentTitleAria')}
            placeholder={t('editor.placeholder')}
            className={cn(
              'w-full bg-transparent text-2xl font-semibold tracking-tight text-fg outline-none',
              'placeholder:text-muted',
              'focus:outline-none',
              isReadOnly && 'cursor-default select-text',
            )}
          />
          <span className="text-xs text-muted" data-testid="editor-save-status" aria-live="polite">
            {saveStatus === 'saving' && t('editor.saveStatusSaving')}
            {saveStatus === 'unsaved' && t('editor.saveStatusUnsaved')}
            {saveStatus === 'saved' &&
              stored?.updatedAt &&
              t('editor.savedAt', {
                time: new Date(stored.updatedAt).toLocaleTimeString(intlLocale(i18n.language), {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })}
          </span>
        </div>
        {editor && <ExportMenu editor={editor} title={title} />}
      </header>

      {/* Toolbar (disabled in read-only but the toggle button stays live) */}
      {editor && (
        <EditorToolbar
          editor={editor}
          isReadOnly={isReadOnly}
          onToggleReadOnly={handleToggleReadOnly}
          onInsertCitation={() => setCitationPickerOpen(true)}
          onOpenTemplates={() => setTemplatesOpen(true)}
          onOpenAiPanel={() => setAiPanelOpen(true)}
          onAddComment={handleAddComment}
          onOpenComments={() => {
            setFocusCommentId(null);
            setCommentsOpen(true);
          }}
        />
      )}

      {/* Corpus citation picker (#599) — portaled to <body> so the fixed overlay
          isn't clipped/anchored by this page's `overflow-auto` scroll container. */}
      {editor &&
        citationPickerOpen &&
        createPortal(
          <CitationPicker editor={editor} onClose={() => setCitationPickerOpen(false)} />,
          document.body,
        )}

      {/* Template library (#600) — portaled to <body> for the same reason. */}
      {editor &&
        templatesOpen &&
        createPortal(
          <TemplatesDialog editor={editor} onClose={() => setTemplatesOpen(false)} />,
          document.body,
        )}

      {/* AI drafting assistant (#601) — right-docked drawer, portaled to <body>. */}
      {editor &&
        aiPanelOpen &&
        createPortal(
          <AiDraftPanel
            editor={editor}
            docId={docId}
            docTitle={title}
            onClose={() => setAiPanelOpen(false)}
          />,
          document.body,
        )}

      {/* Comments / annotations (#602) — right-docked drawer, portaled to <body>. */}
      {editor &&
        commentsOpen &&
        createPortal(
          <CommentsPanel
            editor={editor}
            docId={docId}
            focusCommentId={focusCommentId}
            onClose={() => setCommentsOpen(false)}
          />,
          document.body,
        )}

      {/* TipTap content area */}
      <div
        className={cn(
          'min-h-[60vh] rounded-lg border border-border bg-surface p-6',
          'prose prose-neutral dark:prose-invert max-w-none',
          // Headings inherit the app's display font + tight tracking instead
          // of the plugin's default body font — matches every other heading
          // in the app (`font-display ... tracking-tight`). Sizes/weights per
          // level stay the plugin's own — that per-level cascade IS the
          // "real heading hierarchy" a TipTap H1/H2/H3 was missing.
          'prose-headings:font-display prose-headings:tracking-tight',
          // Brand-aligned link color instead of the plugin's default gray/purple.
          'prose-a:text-indigo-600 dark:prose-a:text-indigo-300',
          // The plugin wraps inline code in literal backtick glyphs by default
          // (`code::before/after { content: "`" }`) — wrong for a legal
          // document, where inline code is rare and shouldn't look decorated.
          'prose-code:before:content-none prose-code:after:content-none',
          // Legal-document typography: slightly wider prose column, comfortable line-height.
          '[&_.ProseMirror]:min-h-[50vh] [&_.ProseMirror]:outline-none',
          // Blockquote — styled as a legal citation block. The plugin also
          // injects decorative quote-mark glyphs on blockquote::before/after
          // by default; killed below so the citation block doesn't look like
          // a pull-quote.
          '[&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:border-indigo-400',
          '[&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:italic [&_.ProseMirror_blockquote]:text-muted',
          '[&_.ProseMirror_blockquote]:before:content-none [&_.ProseMirror_blockquote]:after:content-none',
          // Placeholder text when the editor is empty.
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0',
          // Inline comment highlight (#602): amber span; resolved → dotted underline only.
          '[&_.ProseMirror_.lex-comment]:rounded-sm [&_.ProseMirror_.lex-comment]:bg-[hsl(var(--amber-500)/0.28)]',
          '[&_.ProseMirror_.lex-comment]:box-decoration-clone [&_.ProseMirror_.lex-comment]:px-0.5',
          '[&_.ProseMirror_.lex-comment--resolved]:bg-transparent [&_.ProseMirror_.lex-comment--resolved]:px-0',
          '[&_.ProseMirror_.lex-comment--resolved]:underline [&_.ProseMirror_.lex-comment--resolved]:decoration-dotted',
          '[&_.ProseMirror_.lex-comment--resolved]:decoration-amber-400/70',
          '[&_.ProseMirror_.lex-ai-generated]:rounded-sm [&_.ProseMirror_.lex-ai-generated]:bg-[hsl(var(--indigo-500)/0.18)]',
          '[&_.ProseMirror_.lex-ai-generated]:box-decoration-clone [&_.ProseMirror_.lex-ai-generated]:px-0.5',
          '[&_.ProseMirror_.lex-pending-insert]:rounded-sm [&_.ProseMirror_.lex-pending-insert]:box-decoration-clone',
          '[&_.ProseMirror_.lex-pending-insert]:outline [&_.ProseMirror_.lex-pending-insert]:outline-dashed',
          '[&_.ProseMirror_.lex-pending-insert]:outline-1 [&_.ProseMirror_.lex-pending-insert]:outline-indigo-400/80',
          isReadOnly && 'cursor-default',
        )}
      >
        <EditorContent editor={editor} />
      </div>
    </>
  );
}
