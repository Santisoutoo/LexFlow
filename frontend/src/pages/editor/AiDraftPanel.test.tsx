import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import type { Editor } from '@tiptap/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiDraftPanel } from './AiDraftPanel';
import { AiGeneratedMark } from './extensions/AiGeneratedMark';
import { api } from '@/lib/api';
import { useAiDraftStore } from '@/lib/ai-draft-store';
import { useUi } from '@/lib/store';
import type { ChatSource } from '@/lib/types';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

const useModelsMock = vi.fn();

vi.mock('@/lib/queries', () => ({
  useModels: () => useModelsMock(),
}));

const mockSelection = vi.hoisted(() => ({
  current: '',
}));

vi.mock('@tiptap/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiptap/react')>();
  return {
    ...actual,
    useEditorState: () => mockSelection.current,
  };
});

const insertContentMock = vi.fn().mockReturnThis();
const insertContentAtMock = vi.fn().mockReturnThis();
const insertLegalCitationMock = vi.fn().mockReturnThis();
const setPendingInsertRangeMock = vi.fn();
const clearPendingInsertRangeMock = vi.fn();
const chainMock = {
  focus: vi.fn().mockReturnThis(),
  insertContent: insertContentMock,
  insertContentAt: insertContentAtMock,
  insertLegalCitation: insertLegalCitationMock,
  run: vi.fn(),
};

const schema = getSchema([StarterKit, AiGeneratedMark]);

const docTextBetween = vi.fn((_from: number, _to: number) => '');

const editorState = {
  selection: { from: 0, to: 0, empty: true },
  doc: {
    content: { size: 100 },
    textBetween: (from: number, to: number) => docTextBetween(from, to),
  },
};

const editor = {
  chain: () => chainMock,
  schema,
  commands: {
    setPendingInsertRange: setPendingInsertRangeMock,
    clearPendingInsertRange: clearPendingInsertRangeMock,
  },
  state: editorState,
} as unknown as Editor;

function renderPanel(props?: { docId?: string; docTitle?: string }) {
  const onClose = vi.fn();
  const view = render(
    <MemoryRouter>
      <AiDraftPanel
        editor={editor}
        docId={props?.docId ?? 'doc-1'}
        docTitle={props?.docTitle ?? 'Contrato de arrendamiento'}
        onClose={onClose}
      />
    </MemoryRouter>,
  );
  return { onClose, ...view };
}

function resetEditorSelection(from = 0, to = 0, text = ''): void {
  editorState.selection = { from, to, empty: from === to };
  mockSelection.current = text;
  docTextBetween.mockImplementation((selFrom: number, selTo: number) =>
    selFrom === from && selTo === to ? text : '',
  );
}

describe('AiDraftPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateMock.mockReset();
    insertContentMock.mockClear();
    insertContentAtMock.mockClear();
    insertLegalCitationMock.mockClear();
    chainMock.run.mockClear();
    setPendingInsertRangeMock.mockClear();
    clearPendingInsertRangeMock.mockClear();
    useAiDraftStore.setState({ docs: {} });
    resetEditorSelection();
    useUi.setState({ defaultModel: 'ollama:qwen2.5:7b' });
    useModelsMock.mockReturnValue({
      data: [{ id: 'ollama:qwen2.5:7b', available: true, label: 'qwen2.5:7b', vendor: 'ollama', kind: 'local' }],
    });
    vi.spyOn(api.chat, 'create').mockResolvedValue({
      id: 'thread-1',
      title: 'Asistente',
      updatedAt: new Date().toISOString(),
    });
  });

  it('shows the persistent AI draft disclaimer', () => {
    renderPanel();
    expect(screen.getByText(/revísalo antes de usarlo/i)).toBeInTheDocument();
  });

  it('inserts draft paragraphs with the aiGenerated mark', async () => {
    vi.spyOn(api.chat, 'send').mockImplementation(async function* () {
      yield { type: 'text', delta: 'Borrador IA' };
      yield { type: 'done' };
    });

    renderPanel();
    await userEvent.type(screen.getByLabelText(/instrucción para redactar/i), 'Redacta una cláusula');
    await userEvent.click(screen.getByRole('button', { name: /^generar$/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /insertar solo texto/i })).toBeEnabled();
    });

    await userEvent.click(screen.getByRole('button', { name: /insertar solo texto/i }));

    expect(insertContentMock).toHaveBeenCalled();
    const inserted = insertContentMock.mock.calls[0]?.[0] as unknown[];
    expect(JSON.stringify(inserted)).toContain('Borrador IA');
    expect(JSON.stringify(inserted)).toContain('aiGenerated');
  });

  it('navigates when a draft source citation is clicked', async () => {
    const source: ChatSource = {
      law: 'LOPDGDD',
      article: 'Art. 28',
      date: '2018',
      snippet: 'Protección de datos',
      target: { lawId: 'BOE-A-2018-16673', articleNum: '28' },
    };

    vi.spyOn(api.chat, 'send').mockImplementation(async function* () {
      yield { type: 'text', delta: 'Texto con fuente' };
      yield { type: 'source', source };
      yield { type: 'done' };
    });

    renderPanel();
    await userEvent.type(screen.getByLabelText(/instrucción para redactar/i), 'Redacta');
    await userEvent.click(screen.getByRole('button', { name: /^generar$/i }));

    await waitFor(() => {
      expect(screen.getByText('LOPDGDD')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /LOPDGDD/i }));
    expect(navigateMock).toHaveBeenCalledWith('/laws/BOE-A-2018-16673#art-28');
  });

  it('inserts a preset draft at the captured range, not the live cursor', async () => {
    vi.spyOn(api.chat, 'send').mockImplementation(async function* () {
      yield { type: 'text', delta: 'Cláusula mejorada' };
      yield { type: 'done' };
    });
    resetEditorSelection(5, 10, 'original');

    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /^mejorar$/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /insertar solo texto/i })).toBeEnabled();
    });

    editorState.selection = { from: 40, to: 40, empty: true };
    mockSelection.current = '';

    await userEvent.click(screen.getByRole('button', { name: /insertar solo texto/i }));

    expect(insertContentAtMock).toHaveBeenCalledWith({ from: 5, to: 10 }, expect.any(Array));
    expect(insertContentMock).not.toHaveBeenCalled();
  });

  it('shows a stale-target error and does not insert when the range no longer matches', async () => {
    vi.spyOn(api.chat, 'send').mockImplementation(async function* () {
      yield { type: 'text', delta: 'Cláusula mejorada' };
      yield { type: 'done' };
    });
    resetEditorSelection(5, 10, 'original');

    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /^mejorar$/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /insertar solo texto/i })).toBeEnabled();
    });

    docTextBetween.mockReturnValue('texto distinto');

    await userEvent.click(screen.getByRole('button', { name: /insertar solo texto/i }));

    expect(insertContentAtMock).not.toHaveBeenCalled();
    expect(insertContentMock).not.toHaveBeenCalled();
    expect(screen.getByText(/la selección original ya no está/i)).toBeInTheDocument();
  });

  it('keeps the completed draft after the panel is remounted', async () => {
    vi.spyOn(api.chat, 'send').mockImplementation(async function* () {
      yield { type: 'text', delta: 'Borrador persistente' };
      yield { type: 'done' };
    });

    const { unmount } = renderPanel();
    await userEvent.type(screen.getByLabelText(/instrucción para redactar/i), 'Redacta una cláusula');
    await userEvent.click(screen.getByRole('button', { name: /^generar$/i }));

    await waitFor(() => {
      expect(screen.getByText('Borrador persistente')).toBeInTheDocument();
    });

    unmount();
    renderPanel();
    expect(screen.getByText('Borrador persistente')).toBeInTheDocument();
  });

  it('stops an in-flight stream and keeps the partial draft', async () => {
    vi.spyOn(api.chat, 'send').mockImplementation(async function* (_threadId, _content, opts) {
      yield { type: 'text', delta: 'parcial' };
      await new Promise<void>((_resolve, reject) => {
        opts?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });

    renderPanel();
    await userEvent.type(screen.getByLabelText(/instrucción para redactar/i), 'Redacta');
    await userEvent.click(screen.getByRole('button', { name: /^generar$/i }));

    await waitFor(() => {
      expect(screen.getByText('parcial')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /detener/i }));

    await waitFor(() => {
      expect(useAiDraftStore.getState().getDocState('doc-1').busy).toBe(false);
    });
    expect(screen.getByText('parcial')).toBeInTheDocument();
  });

  it('aborts generation when the panel unmounts mid-stream', async () => {
    vi.spyOn(api.chat, 'send').mockImplementation(async function* (_threadId, _content, opts) {
      yield { type: 'text', delta: 'parcial' };
      await new Promise<void>((_resolve, reject) => {
        opts?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });

    const { unmount } = renderPanel();
    await userEvent.type(screen.getByLabelText(/instrucción para redactar/i), 'Redacta');
    await userEvent.click(screen.getByRole('button', { name: /^generar$/i }));

    await waitFor(() => {
      expect(screen.getByText('parcial')).toBeInTheDocument();
    });

    unmount();

    await waitFor(() => {
      const state = useAiDraftStore.getState().getDocState('doc-1');
      expect(state.busy).toBe(false);
      expect(state.abortController).toBeNull();
    });
    const stream = useAiDraftStore.getState().getDocState('doc-1').stream;
    expect(stream?.role).toBe('assistant');
    if (stream?.role === 'assistant') {
      expect(stream.content).toEqual(['parcial']);
    }
  });

  it('creates one chat thread per document across remounts', async () => {
    const createSpy = vi.spyOn(api.chat, 'create').mockResolvedValue({
      id: 'thread-1',
      title: 'Contrato de arrendamiento',
      updatedAt: new Date().toISOString(),
    });
    vi.spyOn(api.chat, 'send').mockImplementation(async function* () {
      yield { type: 'text', delta: 'uno' };
      yield { type: 'done' };
    });

    const { unmount } = renderPanel();
    await userEvent.type(screen.getByLabelText(/instrucción para redactar/i), 'Primera');
    await userEvent.click(screen.getByRole('button', { name: /^generar$/i }));
    await waitFor(() => {
      expect(screen.getByText('uno')).toBeInTheDocument();
    });
    unmount();

    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /^generar$/i }));
    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledTimes(1);
    });
    expect(createSpy).toHaveBeenCalledWith({
      title: 'Contrato de arrendamiento',
      model: 'ollama:qwen2.5:7b',
    });
  });

  it('creates a separate thread for a different document', async () => {
    const createSpy = vi.spyOn(api.chat, 'create');
    createSpy.mockResolvedValueOnce({
      id: 'thread-a',
      title: 'Doc A',
      updatedAt: new Date().toISOString(),
    });
    createSpy.mockResolvedValueOnce({
      id: 'thread-b',
      title: 'Doc B',
      updatedAt: new Date().toISOString(),
    });
    vi.spyOn(api.chat, 'send').mockImplementation(async function* () {
      yield { type: 'text', delta: 'ok' };
      yield { type: 'done' };
    });

    const first = renderPanel({ docId: 'doc-a', docTitle: 'Doc A' });
    await userEvent.type(screen.getByLabelText(/instrucción para redactar/i), 'A');
    await userEvent.click(screen.getByRole('button', { name: /^generar$/i }));
    await waitFor(() => expect(screen.getByText('ok')).toBeInTheDocument());
    first.unmount();

    renderPanel({ docId: 'doc-b', docTitle: 'Doc B' });
    await userEvent.type(screen.getByLabelText(/instrucción para redactar/i), 'B');
    await userEvent.click(screen.getByRole('button', { name: /^generar$/i }));
    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(2));
    expect(createSpy).toHaveBeenNthCalledWith(1, { title: 'Doc A', model: 'ollama:qwen2.5:7b' });
    expect(createSpy).toHaveBeenNthCalledWith(2, { title: 'Doc B', model: 'ollama:qwen2.5:7b' });
  });

  it('submits the prompt with Ctrl+Enter', async () => {
    const sendSpy = vi.spyOn(api.chat, 'send').mockImplementation(async function* () {
      yield { type: 'text', delta: 'ok' };
      yield { type: 'done' };
    });

    renderPanel();
    const textarea = screen.getByLabelText(/instrucción para redactar/i);
    await userEvent.type(textarea, 'Redacta');
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

    await waitFor(() => {
      expect(sendSpy).toHaveBeenCalled();
    });
  });

  it('does not submit on plain Enter', async () => {
    const sendSpy = vi.spyOn(api.chat, 'send').mockImplementation(async function* () {
      yield { type: 'done' };
    });

    renderPanel();
    const textarea = screen.getByLabelText(/instrucción para redactar/i);
    await userEvent.type(textarea, 'Redacta');
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('closes on Escape and aborts when busy', async () => {
    vi.spyOn(api.chat, 'send').mockImplementation(async function* (_threadId, _content, opts) {
      yield { type: 'text', delta: 'parcial' };
      await new Promise<void>((_resolve, reject) => {
        opts?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });

    const { onClose } = renderPanel();
    await userEvent.type(screen.getByLabelText(/instrucción para redactar/i), 'Redacta');
    await userEvent.click(screen.getByRole('button', { name: /^generar$/i }));
    await waitFor(() => expect(screen.getByText('parcial')).toBeInTheDocument());

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
    await waitFor(() => {
      expect(useAiDraftStore.getState().getDocState('doc-1').busy).toBe(false);
    });
  });
});
