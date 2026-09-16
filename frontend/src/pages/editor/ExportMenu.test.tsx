/**
 * ExportMenu — failed .docx export must surface a danger toast (S1.4).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/react';

const exportDocx = vi.fn();
const exportMarkdown = vi.fn();
const toast = vi.fn();

vi.mock('./export-utils', () => ({
  exportDocx: (...args: unknown[]) => exportDocx(...args),
  exportMarkdown: (...args: unknown[]) => exportMarkdown(...args),
}));

vi.mock('@/lib/toast', () => ({
  toast: (...args: unknown[]) => toast(...args),
}));

import { ExportMenu } from './ExportMenu';

const editor = {
  getJSON: () => ({ type: 'doc', content: [] }),
} as unknown as Editor;

describe('ExportMenu', () => {
  beforeEach(() => {
    exportDocx.mockReset();
    exportMarkdown.mockReset();
    toast.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a danger toast when docx export fails', async () => {
    exportDocx.mockRejectedValue(new Error('fail'));
    render(<ExportMenu editor={editor} title="Doc" />);

    fireEvent.click(screen.getByRole('button', { name: /exportar/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /word/i }));

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith({
        tone: 'danger',
        title: 'No se pudo exportar',
        message: 'Vuelve a intentarlo o exporta en Markdown.',
      });
    });
  });

  it('does not toast when markdown export succeeds', async () => {
    exportMarkdown.mockResolvedValue(undefined);
    render(<ExportMenu editor={editor} title="Doc" />);

    fireEvent.click(screen.getByRole('button', { name: /exportar/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /markdown/i }));

    await waitFor(() => {
      expect(exportMarkdown).toHaveBeenCalled();
    });
    expect(toast).not.toHaveBeenCalled();
  });
});
