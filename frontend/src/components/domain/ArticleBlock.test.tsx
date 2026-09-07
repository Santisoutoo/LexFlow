/**
 * Tests for ArticleBlock citations: superscripts only, no duplicate chip row (#33).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ArticleBlock } from './ArticleBlock';
import type { Article } from '@/lib/types';

const article: Article = {
  id: 'CE-1978::14',
  lawId: 'CE-1978',
  num: '14',
  titulo: 'Igualdad',
  body: [
    {
      marker: '1',
      text: 'Los españoles son iguales ante la ley.',
      depth: 0,
      citations: [{ label: 'LO 3/2018', target: { lawId: 'BOE-A-2018-16673' }, relationKind: 'cites' }],
    },
    {
      marker: '2',
      text: 'Segundo apartado sin cita.',
      depth: 0,
      citations: [],
    },
  ],
  refs: [{ label: 'LO 3/2018', target: { lawId: 'BOE-A-2018-16673' }, relationKind: 'cites' }],
};

describe('ArticleBlock', () => {
  it('renders a citation superscript and no duplicate chip row', () => {
    const { container } = render(<ArticleBlock article={article} />);

    expect(screen.getByTitle('LO 3/2018').tagName).toBe('SUP');
    expect(container.querySelectorAll('sup')).toHaveLength(1);
    // Chip row used to dump `article.refs` as visible labels below the body.
    expect(screen.queryByText('LO 3/2018')).not.toBeInTheDocument();
  });
});
