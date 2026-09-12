/** Per-thread ephemeral streaming state for chat sends. */

import { create } from 'zustand';
import { applyChunk } from '@/lib/api.mock';
import type { ChatChunk, ChatMessage } from '@/lib/types';

interface ThreadStreamState {
  stream: ChatMessage | null;
  pendingUser: ChatMessage | null;
  sending: boolean;
  abortController: AbortController | null;
}

export const EMPTY_THREAD_STATE: ThreadStreamState = {
  stream: null,
  pendingUser: null,
  sending: false,
  abortController: null,
};

interface ChatStreamStore {
  threads: Record<string, ThreadStreamState>;
  getThreadState(threadId: string): ThreadStreamState;
  startSend(threadId: string): AbortController;
  setPendingUser(threadId: string, message: ChatMessage): void;
  applyChunk(threadId: string, chunk: ChatChunk): void;
  stopSend(threadId: string): void;
  finishSend(threadId: string): void;
  clearThread(threadId: string): void;
}

function withThread(
  threads: Record<string, ThreadStreamState>,
  threadId: string,
  updater: (state: ThreadStreamState) => ThreadStreamState,
): Record<string, ThreadStreamState> {
  const current = threads[threadId] ?? EMPTY_THREAD_STATE;
  return { ...threads, [threadId]: updater(current) };
}

export const useChatStream = create<ChatStreamStore>((set, get) => ({
  threads: {},
  getThreadState(threadId) {
    return get().threads[threadId] ?? EMPTY_THREAD_STATE;
  },
  startSend(threadId) {
    const abortController = new AbortController();
    set((state) => ({
      threads: withThread(state.threads, threadId, () => ({
        stream: null,
        pendingUser: null,
        sending: true,
        abortController,
      })),
    }));
    return abortController;
  },
  setPendingUser(threadId, message) {
    set((state) => ({
      threads: withThread(state.threads, threadId, (current) => ({ ...current, pendingUser: message })),
    }));
  },
  applyChunk(threadId, chunk) {
    set((state) => ({
      threads: withThread(state.threads, threadId, (current) => ({
        ...current,
        stream: applyChunk(current.stream, chunk),
      })),
    }));
  },
  stopSend(threadId) {
    const controller = get().threads[threadId]?.abortController;
    controller?.abort();
  },
  finishSend(threadId) {
    set((state) => ({
      threads: withThread(state.threads, threadId, () => EMPTY_THREAD_STATE),
    }));
  },
  clearThread(threadId) {
    set((state) => {
      const next = { ...state.threads };
      delete next[threadId];
      return { threads: next };
    });
  },
}));
