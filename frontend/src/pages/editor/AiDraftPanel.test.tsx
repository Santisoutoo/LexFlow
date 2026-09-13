import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor } from '@tiptap/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiDraftPanel } from './AiDraftPanel';
import { api } from '@/lib/api';
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

const insertContentMock = vi.fn().mockReturnThis();
const insertLegalCitationMock = vi.fn().mockReturnThis();
const chainMock = {
  focus: vi.fn().mockReturnThis(),
  insertContent: insertContentMock,
  insertLegalCitation: insertLegalCitationMock,
  run: vi.fn(),
};

const editor = {
  chain: () => chainMock,
  state: { selection: { from: 0, to: 0, empty: true }, doc: { textBetween: () => '' } },
} as unknown as Editor;

vi.mock('@tiptap/react', () => ({
  useEditorState: () => '',
}));

function renderPanel() {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <AiDraftPanel editor={editor} onClose={onClose} />
    </MemoryRouter>,
  );
  return { onClose };
}

describe('AiDraftPanel trust surfaces', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    insertContentMock.mockClear();
    chainMock.run.mockClear();
    useUi.setState({ defaultModel: 'ollama:qwen2.5:7b' });
    useModelsMock.mockReturnValue({
      data: [{ id: 'ollama:qwen2.5:7b', available: true, label: 'qwen2.5:7b', vendor: 'ollama', kind: 'local' }],
    });
    vi.spyOn(api.chat, 'create').mockResolvedValue({ id: 'thread-1', title: 'Asistente', updatedAt: new Date().toISOString() });
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

    expect(insertContentMock).toHaveBeenCalledWith([
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Borrador IA', marks: [{ type: 'aiGenerated' }] }],
      },
    ]);
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
});
