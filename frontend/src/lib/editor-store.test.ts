import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useEditorStore } from './editor-store';

describe('useEditorStore persist errors', () => {
  beforeEach(() => {
    localStorage.clear();
    useEditorStore.setState({ documents: {}, persistError: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets persistError when localStorage quota is exceeded', () => {
    const quotaError = new DOMException('Quota exceeded', 'QuotaExceededError');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError;
    });

    useEditorStore.getState().saveDocument({
      id: 'draft',
      title: 'Test',
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] },
    });

    expect(useEditorStore.getState().documents.draft?.title).toBe('Test');
    expect(useEditorStore.getState().persistError).toBe('quota_exceeded');
  });

  it('clears persistError after a successful write', () => {
    useEditorStore.setState({ persistError: 'quota_exceeded' });
    useEditorStore.getState().saveDocument({
      id: 'draft',
      title: 'Recovered',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    expect(useEditorStore.getState().persistError).toBeNull();
  });
});
