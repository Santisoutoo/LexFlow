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

describe('useEditorStore document list', () => {
  beforeEach(() => {
    localStorage.clear();
    useEditorStore.setState({ documents: {}, persistError: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists documents newest first', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    useEditorStore.getState().saveDocument({
      id: 'old',
      title: 'Old',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
    useEditorStore.getState().saveDocument({
      id: 'new',
      title: 'New',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    const listed = useEditorStore.getState().listDocuments();
    expect(listed.map((d) => d.id)).toEqual(['new', 'old']);
  });

  it('createDocument mints an id, persists, and returns it', () => {
    const id = useEditorStore.getState().createDocument('Brief');
    expect(id.length).toBeGreaterThan(8);
    const stored = useEditorStore.getState().getDocument(id);
    expect(stored?.title).toBe('Brief');
    expect(useEditorStore.getState().listDocuments()).toHaveLength(1);
  });
});
