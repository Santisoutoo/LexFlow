import { useEffect } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { saveDocumentMock, createDocumentMock } = vi.hoisted(() => ({
  saveDocumentMock: vi.fn(),
  createDocumentMock: vi.fn(() => 'new-doc-id'),
}));

vi.mock('@/lib/editor-store', () => {
  const state = {
    getDocument: () => undefined,
    saveDocument: saveDocumentMock,
    persistError: null,
    clearPersistError: vi.fn(),
    documents: {},
    listDocuments: () => [],
    createDocument: createDocumentMock,
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
    listDocuments: () => [],
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

/** Navigates when `docId` prop changes so doc-switch effects run inside one router. */
function DocIdNavigator({ docId }: { docId: string }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(`/editor/${docId}`);
  }, [docId, navigate]);
  return null;
}

function renderEditorAtDoc(docId: string) {
  return render(
    <MemoryRouter initialEntries={[`/editor/${docId}`]}>
      <DocIdNavigator docId={docId} />
      <Routes>
        <Route path="/editor/:docId" element={<EditorPage />} />
        <Route path="/editor" element={<EditorPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderEditor(initialPath = '/editor/draft') {
  const docId = initialPath.replace(/^\/editor\/?/, '') || 'draft';
  return renderEditorAtDoc(docId);
}

describe('EditorPage autosave flush', () => {
  beforeEach(() => {
    saveDocumentMock.mockReset();
    createDocumentMock.mockReset();
    createDocumentMock.mockReturnValue('new-doc-id');
    mockEditor.getJSON.mockReset();
    mockEditor.getJSON.mockReturnValue({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'saved' }] }],
    });
    onUpdateHandler = undefined;
  });

  it('flushes pending save to outgoing doc when navigating before debounce', async () => {
    const pendingContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'doc-a edit' }] }],
    };
    const view = renderEditorAtDoc('doc-a');
    expect(onUpdateHandler).toBeDefined();
    mockEditor.getJSON.mockReturnValue(pendingContent);
    onUpdateHandler?.({ editor: mockEditor });
    expect(saveDocumentMock).not.toHaveBeenCalled();

    view.rerender(
      <MemoryRouter initialEntries={['/editor/doc-a']}>
        <DocIdNavigator docId="doc-b" />
        <Routes>
          <Route path="/editor/:docId" element={<EditorPage />} />
          <Route path="/editor" element={<EditorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(saveDocumentMock).toHaveBeenCalledWith({
        id: 'doc-a',
        title: 'Document doc-a',
        content: pendingContent,
      });
    });
    expect(saveDocumentMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: 'doc-b', content: pendingContent }),
    );
  });

  it('creates a document from the picker and navigates to the new id', async () => {
    createDocumentMock.mockReturnValue('new-doc-id');
    render(
      <MemoryRouter initialEntries={['/editor']}>
        <Routes>
          <Route path="/editor" element={<EditorPage />} />
          <Route path="/editor/:docId" element={<div data-testid="opened-doc" />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /nuevo documento/i }));
    expect(createDocumentMock).toHaveBeenCalled();
    expect(await screen.findByTestId('opened-doc')).toBeInTheDocument();
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
