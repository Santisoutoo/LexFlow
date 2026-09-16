/**
 * AiDraftPanel — AI-assisted drafting docked in the editor (#601 / #73).
 *
 * Reuses the existing agentic chat stack: streams a grounded answer via
 * `api.chat.send` and accumulates it with the per-document draft store,
 * exactly like ChatPage + `useChatStream`. Streamed text can be inserted
 * into the document; RAG `source` events become #599 typed-citation nodes.
 *
 * Rendered as a right-docked drawer (no backdrop) so the editor stays
 * interactive. Draft state lives in `useAiDraftStore` so close/reopen
 * does not discard a generation or mint duplicate chat threads.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * - Streaming/contract → `api.chat.send` + store `applyChunk`.
 * - Source → citation mapping → `citationFromSource` in `./citation-utils`.
 * - Markdown insertion → `markdownDraftToBlocks` in `./draft-insert-utils`.
 * - Model selection → mirrors ChatPage (`useModels` + `useUi.defaultModel`).
 */
import { useCallback, useEffect, useMemo } from 'react';
import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles, X, Send, Square } from 'lucide-react';
import { Button } from '@/components/ui';
import { CitationCard } from '@/components/domain/CitationCard';
import { api } from '@/lib/api';
import { chatSourceHref } from '@/lib/chat-sources';
import { isSentinelDocumentTitle } from '@/lib/editor-store';
import { EMPTY_DOC_AI_DRAFT, useAiDraftStore, type AiInsertTarget } from '@/lib/ai-draft-store';
import { useModels } from '@/lib/queries';
import { useUi } from '@/lib/store';
import type { ChatSource } from '@/lib/types';
import { citationFromSource, type CitationAttrs } from './citation-utils';
import { isInsertTargetValid, markdownDraftToBlocks } from './draft-insert-utils';

interface AiDraftPanelProps {
  editor: Editor;
  docId: string;
  docTitle: string;
  onClose: () => void;
}

interface Preset {
  id: string;
  labelKey: 'editor.aiDraft.presetImprove' | 'editor.aiDraft.presetSummary' | 'editor.aiDraft.presetExplain';
  build: (selection: string) => string;
}

const PRESETS: Preset[] = [
  {
    id: 'improve',
    labelKey: 'editor.aiDraft.presetImprove',
    build: (s) => `Mejora la redacción de este texto legal, conservando su sentido:\n\n${s}`,
  },
  {
    id: 'summary',
    labelKey: 'editor.aiDraft.presetSummary',
    build: (s) => `Resume de forma concisa este texto:\n\n${s}`,
  },
  {
    id: 'explain',
    labelKey: 'editor.aiDraft.presetExplain',
    build: (s) => `Explica en lenguaje claro este texto:\n\n${s}`,
  },
];

function isAbortError(exc: unknown): boolean {
  return exc instanceof DOMException && exc.name === 'AbortError';
}

function draftingThreadTitle(docTitle: string, fallback: string): string {
  return isSentinelDocumentTitle(docTitle) ? fallback : docTitle;
}

function captureSelectionTarget(editor: Editor): AiInsertTarget | null {
  const { from, to, empty } = editor.state.selection;
  if (empty) return null;
  const text = editor.state.doc.textBetween(from, to, '\n');
  if (!text) return null;
  return { from, to, text };
}

export function AiDraftPanel({ editor, docId, docTitle, onClose }: AiDraftPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: models = [] } = useModels();
  const defaultModel = useUi((s) => s.defaultModel);
  const model = useMemo(() => {
    const current = models.find((m) => m.id === defaultModel);
    if (current?.available) return defaultModel;
    return models.find((m) => m.available)?.id ?? '';
  }, [models, defaultModel]);

  const draft = useAiDraftStore((s) => s.docs[docId] ?? EMPTY_DOC_AI_DRAFT);
  const setPrompt = useAiDraftStore((s) => s.setPrompt);
  const setError = useAiDraftStore((s) => s.setError);
  const setThreadId = useAiDraftStore((s) => s.setThreadId);
  const startGenerate = useAiDraftStore((s) => s.startGenerate);
  const applyChunk = useAiDraftStore((s) => s.applyChunk);
  const stopGenerate = useAiDraftStore((s) => s.stopGenerate);
  const finishGenerate = useAiDraftStore((s) => s.finishGenerate);
  const clearDraft = useAiDraftStore((s) => s.clearDraft);

  const { prompt, stream, busy, error, insertTarget } = draft;

  const selectionText = useEditorState({
    editor,
    selector: (snap) => {
      const { from, to, empty } = snap.editor.state.selection;
      return empty ? '' : snap.editor.state.doc.textBetween(from, to, '\n');
    },
  });

  const draftText = stream?.role === 'assistant' ? stream.content.join('\n\n').trim() : '';
  const sources: ChatSource[] = stream?.role === 'assistant' ? stream.sources : [];
  const streamError = stream?.role === 'assistant' ? stream.error?.detail : null;
  const displayError = error ?? streamError;

  const generate = useCallback(
    async (text: string, target: AiInsertTarget | null) => {
      const content = text.trim();
      if (useAiDraftStore.getState().getDocState(docId).busy || !content) return;
      if (!model) {
        setError(docId, t('editor.aiDraft.noModel'));
        return;
      }
      const controller = startGenerate(docId, target);
      try {
        let threadId = useAiDraftStore.getState().getDocState(docId).threadId;
        if (!threadId) {
          const created = await api.chat.create({
            title: draftingThreadTitle(docTitle, t('editor.aiDraft.threadTitle')),
            model,
          });
          if (useAiDraftStore.getState().getDocState(docId).abortController !== controller) {
            return;
          }
          threadId = created.id;
          setThreadId(docId, threadId);
        }
        for await (const chunk of api.chat.send(threadId, content, { model, signal: controller.signal })) {
          applyChunk(docId, chunk, controller);
        }
      } catch (exc) {
        if (isAbortError(exc)) return;
        setError(docId, exc instanceof Error ? exc.message : t('editor.aiDraft.generateError'));
      } finally {
        finishGenerate(docId, controller);
      }
    },
    [applyChunk, docId, docTitle, finishGenerate, model, setError, setThreadId, startGenerate, t],
  );

  const runPreset = (preset: Preset) => {
    const target = captureSelectionTarget(editor);
    if (!target) return;
    void generate(preset.build(target.text), target);
  };

  const requestClose = useCallback(() => {
    if (useAiDraftStore.getState().getDocState(docId).busy) {
      stopGenerate(docId);
    }
    onClose();
  }, [docId, onClose, stopGenerate]);

  useEffect(() => {
    return () => {
      if (useAiDraftStore.getState().getDocState(docId).busy) {
        useAiDraftStore.getState().stopGenerate(docId);
      }
    };
  }, [docId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose]);

  useEffect(() => {
    if (busy && insertTarget) {
      editor.commands.setPendingInsertRange({ from: insertTarget.from, to: insertTarget.to });
      return () => {
        editor.commands.clearPendingInsertRange();
      };
    }
    editor.commands.clearPendingInsertRange();
    return undefined;
  }, [busy, editor, insertTarget]);

  const insertDraft = (withCitations: boolean) => {
    if (!draftText) return;
    if (insertTarget && !isInsertTargetValid(editor, insertTarget)) {
      setError(docId, t('editor.aiDraft.targetStale'));
      return;
    }
    const blocks = markdownDraftToBlocks(draftText, editor.schema);
    let chain = editor.chain().focus();
    chain = insertTarget
      ? chain.insertContentAt({ from: insertTarget.from, to: insertTarget.to }, blocks)
      : chain.insertContent(blocks);
    if (withCitations) {
      const citations = sources.map(citationFromSource).filter((c): c is CitationAttrs => c !== null);
      if (citations.length > 0) {
        chain = chain.insertContent({
          type: 'paragraph',
          content: [{ type: 'text', text: `${t('editor.aiDraft.sourcesPrefix')} ` }],
        });
        for (const citation of citations) {
          chain = chain.insertLegalCitation(citation);
        }
      }
    }
    chain.run();
    clearDraft(docId);
    onClose();
  };

  const onPromptKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key !== 'Enter' || (!e.ctrlKey && !e.metaKey)) return;
    e.preventDefault();
    if (!busy) void generate(prompt, null);
  };

  const citableCount = sources.filter((s) => s.target?.lawId).length;

  return (
    <aside
      role="complementary"
      aria-label={t('editor.aiDraft.panelAria')}
      className="fixed inset-y-0 right-0 z-40 flex w-[380px] max-w-[92vw] flex-col border-l border-border bg-surface shadow-xl"
    >
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Sparkles className="size-4 text-indigo-600" />
        <span className="flex-1 text-[14px] font-semibold">{t('editor.aiDraft.title')}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('editor.aiDraft.closeAria')}
          title={t('editor.aiDraft.close')}
          onClick={requestClose}
        >
          <X className="size-4" />
        </Button>
      </header>

      <div className="flex-1 space-y-4 overflow-auto p-4 scrollbar-thin">
        {!model && (
          <div className="rounded-lg border border-amber-300/60 bg-amber-soft px-3 py-2 text-[12.5px] text-amber-700 dark:text-amber-300">
            {t('editor.aiDraft.noModel')}
          </div>
        )}

        <p className="text-[11.5px] text-muted">{t('editor.aiDraftDisclaimer')}</p>

        <section className="space-y-2">
          <div className="label-caps">{t('editor.aiDraft.selectionSection')}</div>
          {selectionText ? (
            <div className="truncate rounded bg-surface-2 px-2 py-1 text-[12px] text-muted" title={selectionText}>
              {t('editor.aiDraft.charsSelected', { count: selectionText.length })}
            </div>
          ) : (
            <div className="text-[12px] text-muted">{t('editor.aiDraft.selectTextHint')}</div>
          )}
          {insertTarget && (
            <div className="text-[12px] text-indigo-700 dark:text-indigo-300">{t('editor.aiDraft.pendingTargetHint')}</div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => (
              <Button
                key={preset.id}
                variant="secondary"
                size="sm"
                disabled={!selectionText || busy || !model}
                onClick={() => runPreset(preset)}
              >
                {t(preset.labelKey)}
              </Button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <div className="label-caps">{t('editor.aiDraft.promptSection')}</div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(docId, e.target.value)}
            onKeyDown={onPromptKeyDown}
            aria-label={t('editor.aiDraft.promptAria')}
            placeholder={t('editor.aiDraft.promptPlaceholder')}
            rows={3}
            className="w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-[13.5px] outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-muted"
          />
          <p className="text-[11px] text-muted">{t('editor.aiDraft.submitHint')}</p>
          <Button
            variant="primary"
            size="sm"
            className="w-full"
            icon={busy ? <Square className="size-3.5" /> : <Send className="size-3.5" />}
            disabled={!busy && (!prompt.trim() || !model)}
            aria-label={busy ? t('editor.aiDraft.stopAria') : undefined}
            onClick={() => (busy ? stopGenerate(docId) : void generate(prompt, null))}
          >
            {busy ? t('editor.aiDraft.stop') : t('editor.aiDraft.generate')}
          </Button>
        </section>

        {displayError && (
          <div className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{displayError}</div>
        )}

        {(busy || draftText) && (
          <section className="space-y-2">
            <div className="label-caps">{t('editor.aiDraft.draftSection')}</div>
            <div className="whitespace-pre-wrap rounded-lg border border-border bg-bg px-3 py-2 text-[13px] leading-relaxed">
              {draftText || <span className="text-muted">{t('editor.aiDraft.generating')}</span>}
            </div>

            {sources.length > 0 && (
              <div className="space-y-1">
                <div className="label-caps">{t('chat.sources')}</div>
                <div className="grid grid-cols-1 gap-2">
                  {sources.map((s) => (
                    <CitationCard
                      key={`${s.target?.lawId ?? s.law}::${s.target?.articleNum ?? ''}`}
                      source={s}
                      onClick={() => {
                        const href = chatSourceHref(s);
                        if (href) navigate(href);
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {draftText && !busy && (
              <div className="flex flex-wrap gap-1.5">
                <Button variant="primary" size="sm" onClick={() => insertDraft(true)} disabled={citableCount === 0}>
                  {citableCount > 0
                    ? t('editor.aiDraft.insertWithCitations', { count: citableCount })
                    : t('editor.aiDraft.insertWithCitationsEmpty')}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => insertDraft(false)}>
                  {t('editor.aiDraft.insertTextOnly')}
                </Button>
              </div>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}
