/**
 * Tests for `comment-utils.ts` (#602).
 *
 * The doc-scoping + resolved filter is what keeps the panel showing the right
 * annotations for the open document; a regression would leak another doc's
 * comments or hide active ones.
 */
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';
import type { DocComment } from '@/lib/comment-store';
import { CommentMark } from './extensions/CommentMark';
import {
  filterDocComments,
  findCommentRangeInDoc,
  openCommentCount,
  selectionOverlapsCommentMark,
  stripCommentMarks,
} from './comment-utils';

function makeComment(over: Partial<DocComment>): DocComment {
  return { id: 'x', docId: 'draft', quote: 'q', note: '', createdAt: '2026-01-01T00:00:00.000Z', resolved: false, ...over };
}

const comments: Record<string, DocComment> = {
  a: makeComment({ id: 'a', docId: 'draft', createdAt: '2026-01-01T00:00:02.000Z' }),
  b: makeComment({ id: 'b', docId: 'draft', createdAt: '2026-01-01T00:00:01.000Z', resolved: true }),
  c: makeComment({ id: 'c', docId: 'other', createdAt: '2026-01-01T00:00:00.000Z' }),
};

describe('filterDocComments', () => {
  it('keeps only the doc, sorted oldest first', () => {
    expect(filterDocComments(comments, 'draft', true).map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('excludes resolved when includeResolved is false', () => {
    expect(filterDocComments(comments, 'draft', false).map((c) => c.id)).toEqual(['a']);
  });

  it('returns empty for a doc with no comments', () => {
    expect(filterDocComments(comments, 'missing', true)).toEqual([]);
  });
});

describe('openCommentCount', () => {
  it('counts only unresolved comments of the doc', () => {
    expect(openCommentCount(comments, 'draft')).toBe(1);
    expect(openCommentCount(comments, 'other')).toBe(1);
    expect(openCommentCount(comments, 'missing')).toBe(0);
  });
});

describe('stripCommentMarks', () => {
  it('removes comment marks but keeps text and other marks', () => {
    const content = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'hello',
              marks: [{ type: 'comment', attrs: { commentId: 'c1' } }, { type: 'bold' }],
            },
          ],
        },
      ],
    };
    const stripped = stripCommentMarks(content);
    const marks = stripped.content?.[0]?.content?.[0]?.marks;
    expect(marks).toEqual([{ type: 'bold' }]);
    expect(stripped.content?.[0]?.content?.[0]?.text).toBe('hello');
  });

  it('strips nested comment marks across the tree', () => {
    const content = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'a', marks: [{ type: 'comment', attrs: { commentId: 'x' } }] }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'b' }],
        },
      ],
    };
    const stripped = stripCommentMarks(content);
    expect(stripped.content?.[0]?.content?.[0]?.marks).toBeUndefined();
    expect(stripped.content?.[1]?.content?.[0]?.text).toBe('b');
  });
});

describe('selectionOverlapsCommentMark', () => {
  const schema = getSchema([StarterKit, CommentMark]);

  function docWithComment(commentId: string, text = 'annotated') {
    const mark = schema.marks.comment.create({ commentId, resolved: false });
    const paragraph = schema.nodes.paragraph.create(null, schema.text(text, [mark]));
    return schema.nodes.doc.create(null, paragraph);
  }

  it('returns true when the selection intersects a comment mark', () => {
    const doc = docWithComment('c1');
    expect(selectionOverlapsCommentMark(doc, 1, 5)).toBe(true);
  });

  it('returns false for adjacent non-overlapping ranges', () => {
    const doc = docWithComment('c1', 'ab');
    const plain = schema.nodes.paragraph.create(null, schema.text('cd'));
    const combined = schema.nodes.doc.create(null, [doc.content.firstChild!, plain]);
    // Positions: doc(0) p(0) text "ab"(1-3) p(3) text "cd"(4-6)
    expect(selectionOverlapsCommentMark(combined, 4, 6)).toBe(false);
  });

  it('returns false on plain text with no comment marks', () => {
    const doc = schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, schema.text('plain')));
    expect(selectionOverlapsCommentMark(doc, 1, 4)).toBe(false);
  });

  it('ignores the mark for exceptCommentId so resolve/reopen can update the same span', () => {
    const doc = docWithComment('c1');
    expect(selectionOverlapsCommentMark(doc, 1, 5, 'c1')).toBe(false);
    expect(selectionOverlapsCommentMark(doc, 1, 5, 'other')).toBe(true);
  });
});

describe('findCommentRangeInDoc', () => {
  const schema = getSchema([StarterKit, CommentMark]);

  it('returns the range for a known comment id', () => {
    const mark = schema.marks.comment.create({ commentId: 'c1', resolved: false });
    const paragraph = schema.nodes.paragraph.create(null, schema.text('hello', [mark]));
    const doc = schema.nodes.doc.create(null, paragraph);
    expect(findCommentRangeInDoc(doc, 'c1')).toEqual({ from: 1, to: 6 });
  });

  it('returns null when the anchor is missing', () => {
    const doc = schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, schema.text('plain')));
    expect(findCommentRangeInDoc(doc, 'missing')).toBeNull();
  });
});
