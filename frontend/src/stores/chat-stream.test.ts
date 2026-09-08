import { describe, expect, it } from 'vitest';
import { useChatStream } from './chat-stream';
import type { ChatMessage } from '@/lib/types';

describe('useChatStream', () => {
  it('isolates stream state per thread', () => {
    useChatStream.setState({ threads: {} });
    const pendingA: ChatMessage = {
      id: 'u-a',
      role: 'user',
      createdAt: '2026-01-01T00:00:00.000Z',
      content: 'hola A',
    };
    useChatStream.getState().startSend('thread-a');
    useChatStream.getState().setPendingUser('thread-a', pendingA);
    useChatStream.getState().applyChunk('thread-a', { type: 'text', delta: 'partial A' });

    useChatStream.getState().startSend('thread-b');
    useChatStream.getState().applyChunk('thread-b', { type: 'text', delta: 'partial B' });

    const stateA = useChatStream.getState().getThreadState('thread-a');
    const stateB = useChatStream.getState().getThreadState('thread-b');

    expect(stateA.pendingUser).toEqual(pendingA);
    expect(stateA.stream?.role).toBe('assistant');
    if (stateA.stream?.role === 'assistant') {
      expect(stateA.stream.content).toEqual(['partial A']);
    }
    if (stateB.stream?.role === 'assistant') {
      expect(stateB.stream.content).toEqual(['partial B']);
    }
  });

  it('finishSend clears sending flag and ephemeral state', () => {
    useChatStream.setState({ threads: {} });
    useChatStream.getState().startSend('thread-a');
    useChatStream.getState().finishSend('thread-a');
    const state = useChatStream.getState().getThreadState('thread-a');
    expect(state.sending).toBe(false);
    expect(state.stream).toBeNull();
    expect(state.pendingUser).toBeNull();
    expect(state.abortController).toBeNull();
  });
});
