/**
 * Tests for `LawMarkdown` (#88 S2.3).
 *
 * External links rendered from legal-text Markdown must carry
 * `rel="noopener noreferrer"` alongside `target="_blank"` to prevent
 * reverse-tabnabbing from corpus/law/AI-authored content.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LawMarkdown } from './LawMarkdown';

describe('LawMarkdown', () => {
  it('renders external links with target="_blank" and rel="noopener noreferrer"', () => {
    render(<LawMarkdown>{'[BOE](https://www.boe.es)'}</LawMarkdown>);
    const link = screen.getByRole('link', { name: 'BOE' });
    expect(link).toHaveAttribute('target', '_blank');
    const rel = link.getAttribute('rel') ?? '';
    expect(rel.split(/\s+/)).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
  });

  it('renders paragraphs as block p elements', () => {
    const { container } = render(<LawMarkdown>{'First paragraph.\n\nSecond paragraph.'}</LawMarkdown>);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs.length).toBeGreaterThanOrEqual(1);
    expect(paragraphs[0]?.tagName).toBe('P');
  });

  it('forwards start attribute on ordered lists', () => {
    const { container } = render(<LawMarkdown>{'3. third item\n4. fourth item'}</LawMarkdown>);
    const ol = container.querySelector('ol');
    expect(ol).toBeTruthy();
    expect(ol?.getAttribute('start')).toBe('3');
  });
});
