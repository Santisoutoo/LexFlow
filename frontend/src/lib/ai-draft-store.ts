/**
 * Per-document ephemeral AI-draft state for the editor assistant (#73).
 *
 * Session-scoped (no persist): closing the panel unmounts the UI but the last
 * stream, prompt, and thread id stay here so a reopen does not lose work or
 * mint a duplicate chat thread. Mirrors `useChatStream` abort plumbing.
 *
 * Invariants:
 * - State is keyed by editor `docId`; documents never share a slice.
 * - `threadId` survives `clearDraft` so follow-up prompts stay in one thread.
 * - `stopGenerate` keeps accumulated `stream` (partial draft after Detener).
 */
import { create } from 'zustand';
import { applyChunk as mergeChatChunk } from '@/lib/api.mock';
import type { ChatChunk, ChatMessage } from '@/lib/types';

/** Captured editor range a preset-targeted draft should replace. */
export interface AiInsertTarget {
  from: number;
  to: number;
  text: string;
}

export interface DocAiDraftState {
  prompt: string;
  stream: ChatMessage | null;
  busy: boolean;
  error: string | null;
  threadId: string | null;
  insertTarget: AiInsertTarget | null;
  abortController: AbortController | null;
}

export const EMPTY_DOC_AI_DRAFT: DocAiDraftState = {
  prompt: '',
  stream: null,
  busy: false,
  error: null,
  threadId: null,
  insertTarget: null,
  abortController: null,
};

interface AiDraftStore {
  docs: Record<string, DocAiDraftState>;
  getDocState(docId: string): DocAiDraftState;
  setPrompt(docId: string, prompt: string): void;
  setError(docId: string, error: string | null): void;
  setThreadId(docId: string, threadId: string): void;
  startGenerate(docId: string, insertTarget: AiInsertTarget | null): AbortController;
  applyChunk(docId: string, chunk: ChatChunk, controller: AbortController): void;
  stopGenerate(docId: string): void;
  finishGenerate(docId: string, controller: AbortController): void;
  clearDraft(docId: string): void;
}

function withDoc(
  docs: Record<string, DocAiDraftState>,
  docId: string,
  updater: (state: DocAiDraftState) => DocAiDraftState,
): Record<string, DocAiDraftState> {
  const current = docs[docId] ?? EMPTY_DOC_AI_DRAFT;
  return { ...docs, [docId]: updater(current) };
}

function isCurrentController(doc: DocAiDraftState, controller: AbortController): boolean {
  return doc.abortController === controller;
}

export const useAiDraftStore = create<AiDraftStore>((set, get) => ({
  docs: {},
  getDocState(docId) {
    return get().docs[docId] ?? EMPTY_DOC_AI_DRAFT;
  },
  setPrompt(docId, prompt) {
    set((state) => ({
      docs: withDoc(state.docs, docId, (doc) => ({ ...doc, prompt })),
    }));
  },
  setError(docId, error) {
    set((state) => ({
      docs: withDoc(state.docs, docId, (doc) => ({ ...doc, error })),
    }));
  },
  setThreadId(docId, threadId) {
    set((state) => ({
      docs: withDoc(state.docs, docId, (doc) => ({ ...doc, threadId })),
    }));
  },
  startGenerate(docId, insertTarget) {
    const abortController = new AbortController();
    set((state) => ({
      docs: withDoc(state.docs, docId, (doc) => ({
        ...doc,
        stream: null,
        busy: true,
        error: null,
        insertTarget,
        abortController,
      })),
    }));
    return abortController;
  },
  applyChunk(docId, chunk, controller) {
    set((state) => {
      const current = state.docs[docId] ?? EMPTY_DOC_AI_DRAFT;
      if (!isCurrentController(current, controller)) return state;
      return {
        docs: withDoc(state.docs, docId, (doc) => ({
          ...doc,
          stream: mergeChatChunk(doc.stream, chunk),
        })),
      };
    });
  },
  stopGenerate(docId) {
    const controller = get().docs[docId]?.abortController;
    controller?.abort();
    set((state) => ({
      docs: withDoc(state.docs, docId, (doc) => ({
        ...doc,
        busy: false,
        abortController: null,
      })),
    }));
  },
  finishGenerate(docId, controller) {
    set((state) => {
      const current = state.docs[docId] ?? EMPTY_DOC_AI_DRAFT;
      if (current.abortController !== null && !isCurrentController(current, controller)) {
        return state;
      }
      return {
        docs: withDoc(state.docs, docId, (doc) => ({
          ...doc,
          busy: false,
          abortController: null,
        })),
      };
    });
  },
  clearDraft(docId) {
    set((state) => ({
      docs: withDoc(state.docs, docId, (doc) => ({
        ...EMPTY_DOC_AI_DRAFT,
        threadId: doc.threadId,
      })),
    }));
  },
}));
