import { useEffect } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { saveDocumentMock, createDocumentMock, getDocumentMock } = vi.hoisted(() => ({
  saveDocumentMock: vi.fn(),
  createDocumentMock: vi.fn(() => 'new-doc-id'),
  getDocumentMock: vi.fn(() => undefined as
    | { id: string; title: string; content: unknown; updatedAt: string }
    | undefined),
}));

vi.mock('@/lib/editor-store', () => {
  const state = {
    getDocument: getDocumentMock,
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
    isSentinelDocumentTitle: (title: string) => {
      const trimmed = title.trim();
      return trimmed === '' || trimmed === 'Untitled' || trimmed === 'Draft';
    },
    useEditorStore,
  };
});

import i18n from '@/i18n';
import en from '@/i18n/locales/en/common.json';
import { EditorPage } from './EditorPage';

let onUpdateHandler: ((args: { editor: { getJSON: () => unknown } }) => void) | undefined;

const mockEditor = {
  getJSON: vi.fn(() => ({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'saved' }] }],
  })),
  commands: { setContent: vi.fn() },
  setEditable: vi.fn(),
  extensionManager: { extensions: [{ name: 'placeholder', options: { placeholder: '' } }] },
  view: { dispatch: vi.fn() },
  state: { tr: {} },
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
vi.mock('@/pages/editor/extensions/AiGeneratedMark', () => ({ AiGeneratedMark: {} }));
vi.mock('@/pages/editor/extensions/PendingInsertHighlight', () => ({ PendingInsertHighlight: {} }));

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

function storedDoc(overrides?: { id?: string; updatedAt?: string }) {
  return {
    id: overrides?.id ?? 'draft',
    title: 'Untitled',
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    updatedAt: overrides?.updatedAt ?? '2026-09-12T12:00:00.000Z',
  };
}

function typePendingContent(content: ReturnType<(typeof mockEditor)['getJSON']>) {
  mockEditor.getJSON.mockReturnValue(content);
  act(() => {
    onUpdateHandler?.({ editor: mockEditor });
  });
}

describe('EditorPage autosave flush', () => {
  beforeEach(() => {
    saveDocumentMock.mockReset();
    createDocumentMock.mockReset();
    getDocumentMock.mockReset();
    getDocumentMock.mockReturnValue(undefined);
    createDocumentMock.mockReturnValue('new-doc-id');
    mockEditor.getJSON.mockReset();
    mockEditor.getJSON.mockReturnValue({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'saved' }] }],
    });
    mockEditor.commands.setContent.mockReset();
    onUpdateHandler = undefined;
  });

  it('flushes pending save to outgoing doc when navigating before debounce', async () => {
    const pendingContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'doc-a edit' }] }],
    };
    const view = renderEditorAtDoc('doc-a');
    expect(onUpdateHandler).toBeDefined();
    typePendingContent(pendingContent);
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
    // Incoming doc loads via a remounted useEditor({ content }), not setContent.
    expect(mockEditor.commands.setContent).not.toHaveBeenCalled();
    expect(saveDocumentMock).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'doc-b' }));
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
    typePendingContent(pendingContent);
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

  it('flushes pending save when the tab is hidden', () => {
    const pendingContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hidden-tab' }] }],
    };
    renderEditor();
    typePendingContent(pendingContent);
    expect(saveDocumentMock).not.toHaveBeenCalled();

    const originalVisibility = document.visibilityState;
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => originalVisibility,
    });

    expect(saveDocumentMock).toHaveBeenCalledWith({
      id: 'draft',
      title: 'Draft',
      content: pendingContent,
    });
  });

  it('registers a beforeunload listener that flushes pending save', () => {
    const pendingContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'leaving' }] }],
    };
    renderEditor();
    typePendingContent(pendingContent);
    expect(saveDocumentMock).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event('beforeunload'));
    });

    expect(saveDocumentMock).toHaveBeenCalledWith({
      id: 'draft',
      title: 'Draft',
      content: pendingContent,
    });
  });

  it('does not call setContent or save on initial document load', () => {
    renderEditor();
    expect(mockEditor.commands.setContent).not.toHaveBeenCalled();
    expect(saveDocumentMock).not.toHaveBeenCalled();
  });

  it('uses Spanish i18n for title aria, placeholder and saved line', () => {
    getDocumentMock.mockReturnValue(storedDoc());
    renderEditor();
    expect(screen.getByLabelText('Título del documento')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Documento sin título')).toBeInTheDocument();
    expect(screen.getByText(/^Guardado /)).toBeInTheDocument();
  });

  it('uses English i18n for title aria and placeholder when locale is en', async () => {
    i18n.addResourceBundle('en', 'common', en, true, true);
    await i18n.changeLanguage('en');
    getDocumentMock.mockReturnValue(storedDoc());
    renderEditor();
    expect(screen.getByLabelText('Document title')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Untitled document')).toBeInTheDocument();
    expect(screen.getByText(/^Saved /)).toBeInTheDocument();
    await i18n.changeLanguage('es');
  });
});

describe('EditorPage save indicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveDocumentMock.mockReset();
    getDocumentMock.mockReset();
    getDocumentMock.mockReturnValue(storedDoc());
    mockEditor.getJSON.mockReset();
    mockEditor.getJSON.mockReturnValue({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'saved' }] }],
    });
    onUpdateHandler = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows unsaved while debounce is pending, then saved after flush', () => {
    renderEditor();
    expect(screen.getByTestId('editor-save-status')).toHaveTextContent(/^Guardado /);

    typePendingContent({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'dirty' }] }],
    });
    expect(screen.getByTestId('editor-save-status')).toHaveTextContent('Sin guardar');

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(saveDocumentMock).toHaveBeenCalled();
    expect(screen.getByTestId('editor-save-status')).toHaveTextContent(/^Guardado /);
  });

  it('returns to saved immediately when the title is edited', () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText('Título del documento'), {
      target: { value: 'Nuevo título' },
    });
    expect(saveDocumentMock).toHaveBeenCalled();
    expect(screen.getByTestId('editor-save-status')).toHaveTextContent(/^Guardado /);
  });
});
