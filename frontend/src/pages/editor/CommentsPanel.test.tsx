import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/react';
import i18n from '@/i18n';
import en from '@/i18n/locales/en/common.json';
import { useCommentStore } from '@/lib/comment-store';
import { CommentsPanel } from './CommentsPanel';
import * as commentUtils from './comment-utils';

const toast = vi.fn();

vi.mock('@/lib/toast', () => ({
  toast: (...args: unknown[]) => toast(...args),
}));

const setCommentMock = vi.fn().mockReturnThis();
const unsetCommentMock = vi.fn().mockReturnThis();
const chainMock = {
  focus: vi.fn().mockReturnThis(),
  setTextSelection: vi.fn().mockReturnThis(),
  scrollIntoView: vi.fn().mockReturnThis(),
  setComment: setCommentMock,
  unsetComment: unsetCommentMock,
  run: vi.fn().mockReturnValue(true),
};

const editorState = {
  selection: { from: 1, to: 5, empty: false },
  doc: {
    textBetween: vi.fn(() => 'new quote'),
    descendants: vi.fn(),
  },
};

const editor = {
  chain: () => chainMock,
  state: editorState,
  isEditable: true,
  setEditable: vi.fn(),
} as unknown as Editor;

describe('CommentsPanel orphan state', () => {
  beforeEach(async () => {
    toast.mockReset();
    setCommentMock.mockClear();
    chainMock.setTextSelection.mockClear();
    chainMock.run.mockReturnValue(true);
    vi.spyOn(commentUtils, 'findCommentRangeInDoc').mockReturnValue(null);
    useCommentStore.setState({ comments: {} });
    i18n.addResourceBundle('en', 'common', en, true, true);
    await i18n.changeLanguage('en');
  });

  it('shows an orphan banner when the anchor mark is missing', () => {
    useCommentStore.setState({
      comments: {
        c1: {
          id: 'c1',
          docId: 'draft',
          quote: 'lost text',
          note: '',
          createdAt: '2026-01-01T00:00:00.000Z',
          resolved: false,
        },
      },
    });

    render(<CommentsPanel editor={editor} docId="draft" onClose={vi.fn()} />);
    expect(screen.getByText('Anchor lost')).toBeInTheDocument();
    expect(screen.getByText('Reattach')).toBeInTheDocument();
  });

  it('toasts when locating an orphaned comment', () => {
    useCommentStore.setState({
      comments: {
        c1: {
          id: 'c1',
          docId: 'draft',
          quote: 'lost text',
          note: '',
          createdAt: '2026-01-01T00:00:00.000Z',
          resolved: false,
        },
      },
    });

    render(<CommentsPanel editor={editor} docId="draft" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Locate' }));
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: 'warning',
        message: 'The annotated text is no longer in the document. Reattach or delete the comment.',
      }),
    );
  });

  it('resolves an orphaned comment in the store without a mark', () => {
    useCommentStore.setState({
      comments: {
        c1: {
          id: 'c1',
          docId: 'draft',
          quote: 'lost text',
          note: '',
          createdAt: '2026-01-01T00:00:00.000Z',
          resolved: false,
        },
      },
    });

    render(<CommentsPanel editor={editor} docId="draft" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    expect(setCommentMock).not.toHaveBeenCalled();
    expect(useCommentStore.getState().comments.c1?.resolved).toBe(true);
  });

  it('reattaches a comment onto the current selection', () => {
    useCommentStore.setState({
      comments: {
        c1: {
          id: 'c1',
          docId: 'draft',
          quote: 'old quote',
          note: 'note',
          createdAt: '2026-01-01T00:00:00.000Z',
          resolved: false,
        },
      },
    });

    render(<CommentsPanel editor={editor} docId="draft" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reattach' }));
    expect(setCommentMock).toHaveBeenCalledWith({ commentId: 'c1', resolved: false });
    expect(useCommentStore.getState().comments.c1?.quote).toBe('new quote');
  });
});

describe('CommentsPanel anchored resolve/reopen', () => {
  const anchoredRange = { from: 1, to: 5 };

  beforeEach(async () => {
    toast.mockReset();
    setCommentMock.mockClear();
    chainMock.setTextSelection.mockClear();
    chainMock.run.mockReturnValue(true);
    vi.spyOn(commentUtils, 'findCommentRangeInDoc').mockReturnValue(anchoredRange);
    useCommentStore.setState({ comments: {} });
    i18n.addResourceBundle('en', 'common', en, true, true);
    await i18n.changeLanguage('en');
  });

  it('updates the mark when resolving an anchored comment', () => {
    useCommentStore.setState({
      comments: {
        c1: {
          id: 'c1',
          docId: 'draft',
          quote: 'anchored text',
          note: '',
          createdAt: '2026-01-01T00:00:00.000Z',
          resolved: false,
        },
      },
    });

    render(<CommentsPanel editor={editor} docId="draft" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));

    expect(chainMock.setTextSelection).toHaveBeenCalledWith(anchoredRange);
    expect(setCommentMock).toHaveBeenCalledWith({ commentId: 'c1', resolved: true });
    expect(useCommentStore.getState().comments.c1?.resolved).toBe(true);
  });

  it('updates the mark when reopening an anchored comment', () => {
    useCommentStore.setState({
      comments: {
        c1: {
          id: 'c1',
          docId: 'draft',
          quote: 'anchored text',
          note: '',
          createdAt: '2026-01-01T00:00:00.000Z',
          resolved: true,
        },
      },
    });

    render(<CommentsPanel editor={editor} docId="draft" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));

    expect(chainMock.setTextSelection).toHaveBeenCalledWith(anchoredRange);
    expect(setCommentMock).toHaveBeenCalledWith({ commentId: 'c1', resolved: false });
    expect(useCommentStore.getState().comments.c1?.resolved).toBe(false);
  });
});
