import { describe, expect, it, vi } from 'vitest';
import { useAiDraftStore } from './ai-draft-store';
import type { ChatMessage } from '@/lib/types';

function resetStore(): void {
  useAiDraftStore.setState({ docs: {} });
}

describe('useAiDraftStore', () => {
  it('isolates draft state per document', () => {
    resetStore();
    const controllerA = useAiDraftStore.getState().startGenerate('doc-a', null);
    useAiDraftStore.getState().applyChunk('doc-a', { type: 'text', delta: 'parcial A' }, controllerA);

    const controllerB = useAiDraftStore.getState().startGenerate('doc-b', null);
    useAiDraftStore.getState().applyChunk('doc-b', { type: 'text', delta: 'parcial B' }, controllerB);

    const stateA = useAiDraftStore.getState().getDocState('doc-a');
    const stateB = useAiDraftStore.getState().getDocState('doc-b');
    expect(stateA.stream?.role).toBe('assistant');
    expect(stateB.stream?.role).toBe('assistant');
    if (stateA.stream?.role === 'assistant') {
      expect(stateA.stream.content).toEqual(['parcial A']);
    }
    if (stateB.stream?.role === 'assistant') {
      expect(stateB.stream.content).toEqual(['parcial B']);
    }
  });

  it('stopGenerate aborts the controller and keeps the partial stream', () => {
    resetStore();
    const controller = useAiDraftStore.getState().startGenerate('doc-1', {
      from: 1,
      to: 4,
      text: 'abc',
    });
    useAiDraftStore.getState().applyChunk('doc-1', { type: 'text', delta: 'parcial' }, controller);
    const aborted = vi.fn();
    controller.signal.addEventListener('abort', aborted);

    useAiDraftStore.getState().stopGenerate('doc-1');

    expect(aborted).toHaveBeenCalled();
    const state = useAiDraftStore.getState().getDocState('doc-1');
    expect(state.busy).toBe(false);
    expect(state.abortController).toBeNull();
    expect(state.insertTarget).toEqual({ from: 1, to: 4, text: 'abc' });
    expect(state.stream?.role).toBe('assistant');
    if (state.stream?.role === 'assistant') {
      expect(state.stream.content).toEqual(['parcial']);
    }
  });

  it('keeps threadId across clearDraft so follow-ups reuse the same thread', () => {
    resetStore();
    useAiDraftStore.getState().setThreadId('doc-1', 'thread-x');
    useAiDraftStore.getState().setPrompt('doc-1', 'Redacta');
    const controller = useAiDraftStore.getState().startGenerate('doc-1', null);
    useAiDraftStore.getState().applyChunk('doc-1', { type: 'text', delta: 'hola' }, controller);
    useAiDraftStore.getState().finishGenerate('doc-1', controller);

    useAiDraftStore.getState().clearDraft('doc-1');

    const state = useAiDraftStore.getState().getDocState('doc-1');
    expect(state.threadId).toBe('thread-x');
    expect(state.stream).toBeNull();
    expect(state.prompt).toBe('');
    expect(state.busy).toBe(false);
  });

  it('ignores chunks from a superseded generate', () => {
    resetStore();
    const first = useAiDraftStore.getState().startGenerate('doc-1', null);
    const second = useAiDraftStore.getState().startGenerate('doc-1', null);
    useAiDraftStore.getState().applyChunk('doc-1', { type: 'text', delta: 'viejo' }, first);
    useAiDraftStore.getState().applyChunk('doc-1', { type: 'text', delta: 'nuevo' }, second);

    const stream = useAiDraftStore.getState().getDocState('doc-1').stream as ChatMessage | null;
    expect(stream?.role).toBe('assistant');
    if (stream?.role === 'assistant') {
      expect(stream.content).toEqual(['nuevo']);
    }
  });
});
