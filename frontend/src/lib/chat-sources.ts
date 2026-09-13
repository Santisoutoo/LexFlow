/**
 * Shared helpers for chat corpus source links — used by ChatPage and AiDraftPanel.
 */

import { lawDetailHref } from '@/lib/law-reading';
import type { ChatSource } from '@/lib/types';

/** Resolve a navigable href for a chat source, or null when the target is unknown. */
export function chatSourceHref(source: ChatSource): string | null {
  if (!source.target?.lawId) return null;
  return lawDetailHref(source.target.lawId, source.target.articleNum);
}
