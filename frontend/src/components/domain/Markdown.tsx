/**
 * Shared Markdown primitives for legal and chat surfaces.
 */

import type { ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

function Heading({ children }: { children?: ReactNode }) {
  return <strong className="mb-1 mt-3 block font-display text-[15px] font-semibold first:mt-0">{children}</strong>;
}

export const MARKDOWN_COMPONENTS: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  h1: Heading,
  h2: Heading,
  h3: Heading,
  h4: Heading,
  h5: Heading,
  h6: Heading,
  ul: ({ children }) => <ul className="my-2 ml-5 list-disc space-y-1">{children}</ul>,
  ol: ({ children, start }) => (
    <ol start={start} className="my-2 ml-5 list-decimal space-y-1">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-border-strong pl-3 text-muted">{children}</blockquote>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-[0.92em]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface-2">{children}</thead>,
  th: ({ children }) => <th className="border border-border px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-border px-2 py-1 align-top">{children}</td>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-indigo-600 underline dark:text-indigo-300"
    >
      {children}
    </a>
  ),
  code: ({ children }) => <code className="rounded bg-surface-2 px-1 font-mono text-[0.9em]">{children}</code>,
  hr: () => <hr className="my-3 border-border" />,
};

export function Markdown({ children, components = MARKDOWN_COMPONENTS }: { children: string; components?: Components }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  );
}
