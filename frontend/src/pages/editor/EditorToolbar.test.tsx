import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import en from '@/i18n/locales/en/common.json';
import { EditorToolbar } from './EditorToolbar';

const editorMock = {
  can: () => ({ undo: () => true, redo: () => true }),
  chain: () => ({
    focus: () => ({
      toggleHeading: () => ({ run: vi.fn() }),
      toggleBold: () => ({ run: vi.fn() }),
      toggleItalic: () => ({ run: vi.fn() }),
      toggleBulletList: () => ({ run: vi.fn() }),
      toggleOrderedList: () => ({ run: vi.fn() }),
      toggleBlockquote: () => ({ run: vi.fn() }),
      undo: () => ({ run: vi.fn() }),
      redo: () => ({ run: vi.fn() }),
    }),
  }),
  isActive: () => false,
  state: { selection: { empty: true } },
};

const editorStateMock = vi.hoisted(() => ({
  canUndo: true,
  canRedo: true,
  isH1: false,
  isH2: false,
  isH3: false,
  isBold: false,
  isItalic: false,
  isBulletList: false,
  isOrderedList: false,
  isBlockquote: false,
  isEmptySelection: true,
}));

vi.mock('@tiptap/react', () => ({
  useEditorState: () => editorStateMock,
}));

describe('EditorToolbar i18n', () => {
  beforeEach(async () => {
    i18n.addResourceBundle('en', 'common', en, true, true);
    await i18n.changeLanguage('en');
  });

  afterEach(async () => {
    await i18n.changeLanguage('es');
  });

  it('uses English toolbar labels when locale is en', () => {
    render(
      <EditorToolbar
        editor={editorMock as never}
        isReadOnly={false}
        onToggleReadOnly={vi.fn()}
        onInsertCitation={vi.fn()}
        onOpenTemplates={vi.fn()}
        onOpenAiPanel={vi.fn()}
        onAddComment={vi.fn()}
        onOpenComments={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Heading 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Undo')).toBeInTheDocument();
  });

  it('shows a badge when commentBadgeCount is greater than zero', () => {
    render(
      <EditorToolbar
        editor={editorMock as never}
        isReadOnly={false}
        onToggleReadOnly={vi.fn()}
        onInsertCitation={vi.fn()}
        onOpenTemplates={vi.fn()}
        onOpenAiPanel={vi.fn()}
        onAddComment={vi.fn()}
        onOpenComments={vi.fn()}
        commentBadgeCount={3}
      />,
    );
    expect(screen.getByLabelText('3 open comments')).toHaveTextContent('3');
  });

  it('hides the badge when commentBadgeCount is zero', () => {
    render(
      <EditorToolbar
        editor={editorMock as never}
        isReadOnly={false}
        onToggleReadOnly={vi.fn()}
        onInsertCitation={vi.fn()}
        onOpenTemplates={vi.fn()}
        onOpenAiPanel={vi.fn()}
        onAddComment={vi.fn()}
        onOpenComments={vi.fn()}
        commentBadgeCount={0}
      />,
    );
    expect(screen.queryByLabelText(/open comments/)).not.toBeInTheDocument();
  });

  it('keeps comment buttons enabled in read-only mode', () => {
    editorStateMock.isEmptySelection = false;
    render(
      <EditorToolbar
        editor={editorMock as never}
        isReadOnly={true}
        onToggleReadOnly={vi.fn()}
        onInsertCitation={vi.fn()}
        onOpenTemplates={vi.fn()}
        onOpenAiPanel={vi.fn()}
        onAddComment={vi.fn()}
        onOpenComments={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Comment selection')).not.toBeDisabled();
    expect(screen.getByLabelText('View comments')).not.toBeDisabled();
    expect(screen.getByLabelText('Bold')).toBeDisabled();
    editorStateMock.isEmptySelection = true;
  });
});
