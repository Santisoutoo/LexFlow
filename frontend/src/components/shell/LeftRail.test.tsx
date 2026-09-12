import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LeftRail } from './LeftRail';

describe('LeftRail tour anchors', () => {
  it('exposes a stable selector for the secondary cluster', () => {
    render(
      <MemoryRouter>
        <LeftRail />
      </MemoryRouter>,
    );
    expect(document.querySelector('[data-tour-id="left-rail-secondary"]')).not.toBeNull();
  });

  it('renders a platform-aware collapse shortcut, not a hardcoded Mac glyph', () => {
    render(
      <MemoryRouter>
        <LeftRail />
      </MemoryRouter>,
    );
    const collapse = screen.getByTitle(/colapsar|collapse/i);
    const kbd = collapse.querySelector('kbd');
    expect(kbd?.textContent).toMatch(/^(Ctrl|⌘) \\$/);
    expect(kbd?.textContent).not.toBe('⌘ \\\\');
  });
});
