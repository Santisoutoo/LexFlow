/**
 * Inline decoration for the editor range a preset-targeted AI draft will replace.
 *
 * While a generation is busy with an `insertTarget`, the original `{from,to}`
 * is highlighted (class `lex-pending-insert`; CSS lives in `EditorPage.tsx`).
 * Positions are NOT remapped across edits — insert validates the snapshot and
 * errors on stale ranges instead of guessing a new location (#73 S2.1).
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Node as PmNode } from '@tiptap/pm/model';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface PendingInsertRange {
  from: number;
  to: number;
}

export const pendingInsertHighlightKey = new PluginKey<PendingInsertRange | null>(
  'pendingInsertHighlight',
);

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pendingInsertHighlight: {
      setPendingInsertRange: (range: PendingInsertRange) => ReturnType;
      clearPendingInsertRange: () => ReturnType;
    };
  }
}

function decorationsForRange(doc: PmNode, range: PendingInsertRange | null) {
  if (!range) return DecorationSet.empty;
  const size = doc.content.size;
  if (range.from < 0 || range.to <= range.from || range.to > size) return DecorationSet.empty;
  return DecorationSet.create(doc, [Decoration.inline(range.from, range.to, { class: 'lex-pending-insert' })]);
}

export const PendingInsertHighlight = Extension.create({
  name: 'pendingInsertHighlight',

  addCommands() {
    return {
      setPendingInsertRange:
        (range) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta('addToHistory', false);
            tr.setMeta(pendingInsertHighlightKey, range);
            dispatch(tr);
          }
          return true;
        },
      clearPendingInsertRange:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta('addToHistory', false);
            tr.setMeta(pendingInsertHighlightKey, null);
            dispatch(tr);
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pendingInsertHighlightKey,
        state: {
          init: (): PendingInsertRange | null => null,
          apply(tr, range: PendingInsertRange | null): PendingInsertRange | null {
            const meta = tr.getMeta(pendingInsertHighlightKey) as PendingInsertRange | null | undefined;
            if (meta !== undefined) return meta;
            return range;
          },
        },
        props: {
          decorations(state) {
            const range = pendingInsertHighlightKey.getState(state) ?? null;
            return decorationsForRange(state.doc, range);
          },
        },
      }),
    ];
  },
});
