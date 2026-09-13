/**
 * `aiGenerated` — inline mark tagging text inserted from the AI drafting panel (#62).
 *
 * Rendered as a `span[data-ai-generated]` with class `lex-ai-generated`; highlight
 * CSS is co-located in `EditorPage.tsx`. `inclusive: false` so typing after an
 * AI span does not extend the mark.
 */
import { Mark, mergeAttributes } from '@tiptap/react';

export const AiGeneratedMark = Mark.create({
  name: 'aiGenerated',
  inclusive: false,

  parseHTML() {
    return [{ tag: 'span[data-ai-generated]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'lex-ai-generated', 'data-ai-generated': 'true' }), 0];
  },
});
