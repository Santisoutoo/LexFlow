import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor } from '@tiptap/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CitationPicker } from './CitationPicker';

const useSearchMock = vi.fn();

vi.mock('@/lib/queries', () => ({
  useSearch: (q: string) => useSearchMock(q),
}));

vi.mock('@/lib/useFocusTrap', () => ({
  useFocusTrap: vi.fn(),
}));

let debouncedQuery = '';

vi.mock('@/lib/use-debounced-value', () => ({
  useDebouncedValue: (value: string) => debouncedQuery || value,
}));

const insertLegalCitationMock = vi.fn().mockReturnThis();
const chainMock = {
  focus: vi.fn().mockReturnThis(),
  insertLegalCitation: insertLegalCitationMock,
  run: vi.fn(),
};

const editor = {
  chain: () => chainMock,
} as unknown as Editor;

const hits = [
  {
    id: 'h1',
    kind: 'article' as const,
    title: 'Constitución Española',
    snippet: 'España se constituye…',
    match: null,
    articleNumber: '1',
    payload: { lawId: 'CE-1978' },
  },
  {
    id: 'h2',
    kind: 'article' as const,
    title: 'Constitución Española',
    snippet: 'La soberanía…',
    match: null,
    articleNumber: '2',
    payload: { lawId: 'CE-1978' },
  },
];

describe('CitationPicker', () => {
  beforeEach(() => {
    debouncedQuery = '';
    useSearchMock.mockReset();
    useSearchMock.mockReturnValue({ data: { hits }, isFetching: false });
    chainMock.run.mockReset();
  });

  it('shows searching only when fetching with no prior hits', async () => {
    useSearchMock.mockReturnValue({ data: undefined, isFetching: true });
    render(<CitationPicker editor={editor} onClose={vi.fn()} />);
    await userEvent.type(screen.getByRole('textbox'), 'co');
    expect(screen.getByText(/buscando/i)).toBeInTheDocument();
  });

  it('does not reset active row on intermediate keystrokes before debounced results change', async () => {
    debouncedQuery = 'co';
    render(<CitationPicker editor={editor} onClose={vi.fn()} />);
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'const');
    const options = screen.getAllByRole('option');
    fireEvent.mouseEnter(options[1]);
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('inserts citation and closes on Enter', async () => {
    const onClose = vi.fn();
    render(<CitationPicker editor={editor} onClose={onClose} />);
    await userEvent.type(screen.getByRole('textbox'), 'const');
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' });
    });
    expect(insertLegalCitationMock).toHaveBeenCalled();
    expect(chainMock.run).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
