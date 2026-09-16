import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import type { Editor, JSONContent } from '@tiptap/react';
import { AiGeneratedMark } from './extensions/AiGeneratedMark';
import { isInsertTargetValid, markdownDraftToBlocks } from './draft-insert-utils';

const schema = getSchema([StarterKit, AiGeneratedMark]);

function collectTextNodes(nodes: JSONContent[]): JSONContent[] {
  const out: JSONContent[] = [];
  const walk = (node: JSONContent) => {
    if (node.type === 'text') out.push(node);
    node.content?.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

describe('markdownDraftToBlocks', () => {
  it('maps bold, heading, and list markdown to schema nodes with aiGenerated marks', () => {
    const blocks = markdownDraftToBlocks('## Título\n\n**Cláusula**\n\n- Item uno', schema);
    const json = JSON.stringify(blocks);
    const types = blocks.map((node) => node.type);

    expect(json).not.toContain('**');
    expect(json).not.toContain('##');
    expect(types).toContain('heading');
    expect(types).toContain('bulletList');
    expect(json).toContain('bold');

    const texts = collectTextNodes(blocks);
    expect(texts.length).toBeGreaterThan(0);
    for (const node of texts) {
      expect(node.marks?.some((mark) => mark.type === 'aiGenerated')).toBe(true);
    }
    expect(texts.some((node) => node.text === 'Cláusula')).toBe(true);
    expect(texts.some((node) => node.text === 'Item uno')).toBe(true);
  });
});

describe('isInsertTargetValid', () => {
  it('accepts a range whose text still matches', () => {
    const editor = {
      state: {
        doc: {
          content: { size: 20 },
          textBetween: (from: number, to: number) => (from === 2 && to === 6 ? 'abcd' : ''),
        },
      },
    } as unknown as Editor;
    expect(isInsertTargetValid(editor, { from: 2, to: 6, text: 'abcd' })).toBe(true);
  });

  it('rejects a stale range whose text no longer matches', () => {
    const editor = {
      state: {
        doc: {
          content: { size: 20 },
          textBetween: () => 'other',
        },
      },
    } as unknown as Editor;
    expect(isInsertTargetValid(editor, { from: 2, to: 6, text: 'abcd' })).toBe(false);
  });

  it('rejects a range past the document end', () => {
    const editor = {
      state: {
        doc: {
          content: { size: 4 },
          textBetween: () => 'abcd',
        },
      },
    } as unknown as Editor;
    expect(isInsertTargetValid(editor, { from: 2, to: 8, text: 'abcd' })).toBe(false);
  });
});
