/**
 * Markdown → TipTap JSON for AI draft insertion (#73 / #601 v2).
 *
 * Reuses the template-import pipeline (`marked` → HTML → `htmlToTiptapContent`)
 * so headings, lists, and emphasis map to schema nodes instead of literal
 * `**` / `##` / `-` glyphs. Every resulting text node gets the `aiGenerated`
 * mark (existing marks like `bold` are kept).
 *
 * Unsupported markdown (tables, fenced code) degrades via ProseMirror's HTML
 * parser — same as template import. Full GFM parity is not required here.
 *
 * --- WHERE TO CHANGE IF THE EDITOR SCHEMA GROWS ---
 * Pass `editor.schema` at insert time so new nodes (citations, comments)
 * stay out of the parse; they are not created from markdown.
 */
import type { Editor, JSONContent } from '@tiptap/react';
import type { Schema } from '@tiptap/pm/model';
import { marked } from 'marked';
import type { AiInsertTarget } from '@/lib/ai-draft-store';
import { htmlToTiptapContent } from './import-utils';

/**
 * Parse assistant markdown into insertable TipTap blocks tagged as AI-generated.
 *
 * @param text - Raw assistant output (markdown-ish).
 * @param schema - Live editor schema (`editor.schema`), not a test-only subset.
 */
export function markdownDraftToBlocks(text: string, schema: Schema): JSONContent[] {
  const html = marked.parse(text, { async: false }) as string;
  const doc = htmlToTiptapContent(html, schema);
  return (doc.content ?? []).map(withAiGeneratedMark);
}

/** True when the captured preset range still matches the live document. */
export function isInsertTargetValid(editor: Editor, target: AiInsertTarget): boolean {
  const size = editor.state.doc.content.size;
  if (target.from < 0 || target.to <= target.from || target.to > size) return false;
  return editor.state.doc.textBetween(target.from, target.to, '\n') === target.text;
}

function withAiGeneratedMark(node: JSONContent): JSONContent {
  if (node.type === 'text') return withMarkOnText(node);
  if (!node.content) return node;
  return { ...node, content: node.content.map(withAiGeneratedMark) };
}

function withMarkOnText(node: JSONContent): JSONContent {
  const marks = node.marks ?? [];
  if (marks.some((mark) => mark.type === 'aiGenerated')) return node;
  return { ...node, marks: [...marks, { type: 'aiGenerated' }] };
}
