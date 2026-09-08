/**
 * Renders a fragment of legal text as Markdown (#591).
 *
 * The legalize-es bodies carry real Markdown — headings (`######`), GFM
 * tables (`|`), lists, bold — which the article view used to dump as raw
 * source ("###### Disposición adicional única", literal pipes). This wraps
 * `react-markdown` + `remark-gfm` with a theme-token component map so the
 * text reads like a document.
 *
 * Clause markers and citation superscripts are rendered by `ArticleBlock`
 * outside this component, so paragraphs render as proper block `<p>` elements.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * * Element styling → the shared `MARKDOWN_COMPONENTS` map in `Markdown.tsx`.
 */

import { Markdown } from './Markdown';

export function LawMarkdown({ children }: { children: string }) {
  return <Markdown>{children}</Markdown>;
}
