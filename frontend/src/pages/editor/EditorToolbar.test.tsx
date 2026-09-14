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

vi.mock('@tiptap/react', () => ({
  useEditorState: () => ({
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
  }),
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
});
