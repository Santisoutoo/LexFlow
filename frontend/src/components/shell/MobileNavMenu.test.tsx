import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { MobileNavMenu } from './MobileNavMenu';

function renderMenu(onClose = vi.fn()) {
  return {
    onClose,
    ...render(
      <MemoryRouter>
        <MobileNavMenu onClose={onClose} />
      </MemoryRouter>,
    ),
  };
}

describe('MobileNavMenu', () => {
  it('links to settings, editor, and communities', () => {
    renderMenu();
    expect(screen.getByRole('link', { name: /ajustes|settings/i })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('link', { name: /editor/i })).toHaveAttribute('href', '/editor');
    expect(screen.getByRole('link', { name: /comunidades|communities/i })).toHaveAttribute('href', '/communities');
  });

  it('closes on backdrop click and Escape', () => {
    const { onClose } = renderMenu();
    const closers = screen.getAllByRole('button', { name: /cerrar menú|close menu/i });
    fireEvent.click(closers[0]);
    expect(onClose).toHaveBeenCalled();

    onClose.mockClear();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
