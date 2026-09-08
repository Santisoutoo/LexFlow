/** Chat-sized markdown renderer for assistant turns. */

import type { ReactNode } from 'react';
import { Markdown, MARKDOWN_COMPONENTS } from './Markdown';

const CHAT_COMPONENTS = {
  ...MARKDOWN_COMPONENTS,
  p: ({ children }: { children?: ReactNode }) => (
    <p className="mb-2 last:mb-0 text-[14.5px] leading-relaxed">{children}</p>
  ),
};

export function ChatMarkdown({ children }: { children: string }) {
  return <Markdown components={CHAT_COMPONENTS}>{children}</Markdown>;
}
