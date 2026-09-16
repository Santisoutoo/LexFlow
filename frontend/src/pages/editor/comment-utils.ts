/**
 * Pure helpers for inline document comments (#602).
 *
 * Kept free of React/TipTap so the selection/filtering logic is unit-testable
 * without an editor. Range lookup (`findCommentRangeInDoc`) works on a
 * ProseMirror doc snapshot; the panel passes `editor.state.doc`.
 */
import type { JSONContent } from '@tiptap/react';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { DocComment } from '@/lib/comment-store';

/**
 * Comments for one document, oldest first.
 *
 * `includeResolved` controls whether resolved comments are kept — the panel
 * shows them in a separate, muted section; counts/badges use `false`.
 */
export function filterDocComments(
  comments: Record<string, DocComment>,
  docId: string,
  includeResolved: boolean,
): DocComment[] {
  const forDoc = Object.values(comments).filter((c) => c.docId === docId && (includeResolved || !c.resolved));
  return forDoc.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Count of open (unresolved) comments for a document — drives the toolbar badge. */
export function openCommentCount(comments: Record<string, DocComment>, docId: string): number {
  return filterDocComments(comments, docId, false).length;
}

/** Deep-clone TipTap JSON, removing every `comment` mark (templates / round-trip safety). */
export function stripCommentMarks(content: JSONContent): JSONContent {
  const next: JSONContent = { ...content };
  if (typeof content.text === 'string' && content.marks) {
    const marks = content.marks.filter((m) => m.type !== 'comment');
    next.marks = marks.length > 0 ? marks : undefined;
  }
  if (content.content) {
    next.content = content.content.map(stripCommentMarks);
  }
  return next;
}

/**
 * True when any text node in `[from, to)` already carries a `comment` mark.
 *
 * `exceptCommentId` skips marks for that id so resolve/reopen can update the
 * same anchored span without tripping the overlap guard.
 */
export function selectionOverlapsCommentMark(
  doc: ProseMirrorNode,
  from: number,
  to: number,
  exceptCommentId?: string,
): boolean {
  let overlaps = false;
  doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return;
    const hasOtherComment = node.marks.some(
      (m) => m.type.name === 'comment' && m.attrs.commentId !== exceptCommentId,
    );
    if (hasOtherComment) overlaps = true;
  });
  return overlaps;
}

/** Map a `commentId` to its document range, or null when the anchor is gone. */
export function findCommentRangeInDoc(
  doc: ProseMirrorNode,
  commentId: string,
): { from: number; to: number } | null {
  let from: number | null = null;
  let to: number | null = null;
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const hasMark = node.marks.some((m) => m.type.name === 'comment' && m.attrs.commentId === commentId);
    if (hasMark) {
      if (from === null) from = pos;
      to = pos + node.nodeSize;
    }
  });
  return from !== null && to !== null ? { from, to } : null;
}
