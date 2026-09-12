import { render } from '@testing-library/react';
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
});
