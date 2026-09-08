import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatMarkdown } from './ChatMarkdown';

describe('ChatMarkdown', () => {
  it('renders headings, bullets, code, and bold instead of literal markers', () => {
    const source = '## Resumen\n\n- primer punto\n\n`code`\n\n**bold**';
    const { container } = render(<ChatMarkdown>{source}</ChatMarkdown>);
    expect(container.querySelector('strong')).toBeTruthy();
    expect(container.querySelector('code')).toBeTruthy();
    expect(container.querySelector('ul')).toBeTruthy();
    expect(container.textContent).toContain('Resumen');
    expect(container.textContent).toContain('primer punto');
    expect(container.textContent).toContain('bold');
    expect(screen.queryByText('## Resumen')).toBeNull();
  });
});
