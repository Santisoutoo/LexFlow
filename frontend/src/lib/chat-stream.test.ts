import { describe, expect, it } from 'vitest';
import { applyChunk } from './api.mock';
import { parseSseEvent } from './api/chat';
import type { ChatSource } from './types';

const sampleSource: ChatSource = {
  law: 'LOPDGDD',
  article: 'Art. 28',
  date: '2018-12-06',
  snippet: 'El responsable del tratamiento…',
  target: { lawId: 'BOE-A-2018-16673', articleNum: '28' },
};

describe('parseSseEvent', () => {
  it('reads error code from SSE payload', () => {
    const chunk = parseSseEvent(
      'error',
      JSON.stringify({ detail: 'Ollama is not running or unreachable.', code: 'ollama_not_running' }),
    );
    expect(chunk).toEqual({
      type: 'error',
      detail: 'Ollama is not running or unreachable.',
      code: 'ollama_not_running',
    });
  });
});

describe('applyChunk', () => {
  it('sets toolActivity on tool_call and clears it on first text', () => {
    let msg = applyChunk(null, { type: 'tool_call', name: 'search_law', args: { q: 'datos' } });
    expect(msg?.role).toBe('assistant');
    if (msg?.role === 'assistant') {
      expect(msg.toolActivity).toBe('chat.toolActivity.searchCorpus');
      expect(msg.streaming).toBe(true);
    }

    msg = applyChunk(msg, { type: 'text', delta: 'Hola' });
    if (msg?.role === 'assistant') {
      expect(msg.toolActivity).toBeNull();
      expect(msg.content).toEqual(['Hola']);
    }
  });

  it('dedupes source chunks by law and article', () => {
    let msg = applyChunk(null, { type: 'source', source: sampleSource });
    msg = applyChunk(msg, { type: 'source', source: { ...sampleSource, snippet: 'otro' } });
    if (msg?.role === 'assistant') {
      expect(msg.sources).toHaveLength(1);
    }
  });

  it('stores error and degraded flags on the assistant shell', () => {
    let msg = applyChunk(null, { type: 'tool_call', name: 'search_law', args: { q: 'datos' } });
    if (msg?.role === 'assistant') {
      expect(msg.toolActivity).toBe('chat.toolActivity.searchCorpus');
    }

    msg = applyChunk(msg, { type: 'error', detail: 'upstream failed', code: 'provider_error' });
    if (msg?.role === 'assistant') {
      expect(msg.error).toEqual({ detail: 'upstream failed', code: 'provider_error' });
      expect(msg.toolActivity).toBeNull();
    }
    msg = applyChunk(msg, { type: 'degraded', reason: 'tools_unsupported' });
    if (msg?.role === 'assistant') {
      expect(msg.corpusDegraded).toBe(true);
      expect(msg.toolActivity).toBeNull();
    }
    msg = applyChunk(msg, { type: 'done' });
    if (msg?.role === 'assistant') {
      expect(msg.streaming).toBe(false);
      expect(msg.toolActivity).toBeNull();
    }
  });
});
