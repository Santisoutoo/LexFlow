import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor } from '@tiptap/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentTemplate } from '@/lib/template-store';
import { TemplatesDialog } from './TemplatesDialog';

const deleteTemplateMock = vi.fn();
const saveTemplateMock = vi.fn();
const createDocumentMock = vi.fn(() => 'new-doc-1');
const saveDocumentMock = vi.fn();
const confirmMock = vi.fn();

vi.mock('@/lib/template-store', () => ({
  useTemplateStore: () => ({
    templates: {
      t1: {
        id: 't1',
        name: 'Demanda',
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hola' }] }] },
        createdAt: '2026-01-01T00:00:00.000Z',
      } satisfies DocumentTemplate,
      t2: {
        id: 't2',
        name: 'Con variables',
        content: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '{{parte}}' }] }],
        },
        createdAt: '2026-01-02T00:00:00.000Z',
      } satisfies DocumentTemplate,
    },
    saveTemplate: saveTemplateMock,
    deleteTemplate: deleteTemplateMock,
  }),
}));

vi.mock('@/lib/editor-store', () => ({
  useEditorStore: () => ({
    createDocument: createDocumentMock,
    saveDocument: saveDocumentMock,
  }),
}));

vi.mock('@/lib/confirm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/confirm')>();
  return {
    ...actual,
    useConfirm: () => confirmMock,
  };
});

vi.mock('@/lib/useFocusTrap', () => ({
  useFocusTrap: vi.fn(),
}));

vi.mock('./TemplateFillForm', () => ({
  TemplateFillForm: ({
    onBack,
    onApply,
  }: {
    onBack: () => void;
    onApply: (values: Record<string, string>) => void;
  }) => (
    <div>
      <p>Rellena las variables para generar el borrador</p>
      <label htmlFor="parte-input">Valor para parte</label>
      <input id="parte-input" aria-label="Valor para parte" />
      <button type="button" onClick={onBack}>
        Volver
      </button>
      <button type="button" onClick={() => onApply({ parte: 'demandante' })}>
        Aplicar plantilla
      </button>
    </div>
  ),
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

const insertContentMock = vi.fn().mockReturnThis();
const chainMock = {
  focus: vi.fn().mockReturnThis(),
  insertContent: insertContentMock,
  run: vi.fn(),
};

const editor = {
  chain: () => chainMock,
  getJSON: vi.fn(() => ({ type: 'doc', content: [] })),
  schema: {},
} as unknown as Editor;

function renderDialog(onClose = vi.fn()) {
  return render(<TemplatesDialog editor={editor} onClose={onClose} />);
}

describe('TemplatesDialog', () => {
  beforeEach(() => {
    deleteTemplateMock.mockReset();
    createDocumentMock.mockReset();
    saveDocumentMock.mockReset();
    navigateMock.mockReset();
    confirmMock.mockReset();
    confirmMock.mockResolvedValue(false);
    chainMock.run.mockReset();
    insertContentMock.mockReset();
  });

  it('does not delete a template without confirm approval', async () => {
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: /eliminar plantilla demanda/i }));
    expect(confirmMock).toHaveBeenCalled();
    expect(deleteTemplateMock).not.toHaveBeenCalled();
  });

  it('deletes a template when confirm resolves true', async () => {
    confirmMock.mockResolvedValue(true);
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: /eliminar plantilla demanda/i }));
    await waitFor(() => {
      expect(deleteTemplateMock).toHaveBeenCalledWith('t1');
    });
  });

  it('returns to list view on Escape in fill form without closing dialog', async () => {
    renderDialog();
    const applyButtons = screen.getAllByRole('button', { name: /^aplicar$/i });
    await userEvent.click(applyButtons[0]);
    expect(screen.getByText(/rellena las variables/i)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByText('Con variables')).toBeInTheDocument();
    expect(screen.queryByText(/rellena las variables/i)).not.toBeInTheDocument();
  });

  it('closes dialog on second Escape from list view', async () => {
    const onClose = vi.fn();
    renderDialog(onClose);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('applies template in a new document', async () => {
    renderDialog();
    const newDocButtons = screen.getAllByRole('button', { name: /aplicar en documento nuevo/i });
    await userEvent.click(newDocButtons[newDocButtons.length - 1]);
    expect(createDocumentMock).toHaveBeenCalledWith('Demanda');
    expect(saveDocumentMock).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith('/editor/new-doc-1');
  });
});
