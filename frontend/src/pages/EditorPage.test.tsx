import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { saveDocumentMock } = vi.hoisted(() => ({
  saveDocumentMock: vi.fn(),
}));

vi.mock('@/lib/editor-store', () => {
  const state = {
    getDocument: () => undefined,
    saveDocument: saveDocumentMock,
    persistError: null,
    clearPersistError: vi.fn(),
  };
  const useEditorStore = (selector?: (s: typeof state) => unknown) =>
    typeof selector === 'function' ? selector(state) : state;
  return {
    DEFAULT_DOC_ID: 'draft',
    makeDefaultDocument: (id: string) => ({
      id,
      title: id === 'draft' ? 'Draft' : `Document ${id}`,
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      updatedAt: new Date().toISOString(),
    }),
    useEditorStore,
  };
});

import { EditorPage } from './EditorPage';

let onUpdateHandler: ((args: { editor: { getJSON: () => unknown } }) => void) | undefined;

const mockEditor = {
  getJSON: vi.fn(() => ({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'saved' }] }],
  })),
  commands: { setContent: vi.fn() },
  setEditable: vi.fn(),
};

vi.mock('@tiptap/react', () => ({
  useEditor: (opts: { onUpdate?: (args: { editor: { getJSON: () => unknown } }) => void }) => {
    onUpdateHandler = opts.onUpdate;
    return mockEditor;
  },
  EditorContent: () => <div data-testid="editor-content" />,
}));

vi.mock('@tiptap/starter-kit', () => ({ default: {} }));
vi.mock('@tiptap/extension-placeholder', () => ({ default: { configure: () => ({}) } }));
vi.mock('@/pages/editor/EditorToolbar', () => ({ EditorToolbar: () => null }));
vi.mock('@/pages/editor/CitationPicker', () => ({ CitationPicker: () => null }));
vi.mock('@/pages/editor/TemplatesDialog', () => ({ TemplatesDialog: () => null }));
vi.mock('@/pages/editor/AiDraftPanel', () => ({ AiDraftPanel: () => null }));
vi.mock('@/pages/editor/CommentsPanel', () => ({ CommentsPanel: () => null }));
vi.mock('@/pages/editor/ExportMenu', () => ({ ExportMenu: () => null }));
vi.mock('@/pages/editor/extensions/LegalCitation', () => ({ LegalCitation: {} }));
vi.mock('@/pages/editor/extensions/CommentMark', () => ({ CommentMark: {} }));

function renderEditor(initialPath = '/editor/draft') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/editor/:docId" element={<EditorPage />} />
        <Route path="/editor" element={<EditorPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('EditorPage autosave flush', () => {
  beforeEach(() => {
    saveDocumentMock.mockReset();
    mockEditor.getJSON.mockReset();
    mockEditor.getJSON.mockReturnValue({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'saved' }] }],
    });
    onUpdateHandler = undefined;
  });

  it('flushes pending debounced save on unmount', async () => {
    const pendingContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'pending' }] }],
    };
    const view = renderEditor();
    expect(onUpdateHandler).toBeDefined();
    mockEditor.getJSON.mockReturnValue(pendingContent);
    onUpdateHandler?.({ editor: mockEditor });
    expect(saveDocumentMock).not.toHaveBeenCalled();
    view.unmount();
    await waitFor(() => {
      expect(saveDocumentMock).toHaveBeenCalledWith({
        id: 'draft',
        title: 'Draft',
        content: pendingContent,
      });
    });
  });
});
