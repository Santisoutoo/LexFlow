import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { SearchRedirect } from './SearchRedirect';

function renderRedirect(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/search" element={<SearchRedirect />} />
        <Route path="/explorer" element={<div data-testid="explorer" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SearchRedirect', () => {
  it('redirects /search?q=test to /explorer?q=test', async () => {
    renderRedirect('/search?q=test');
    expect(await screen.findByTestId('explorer')).toBeInTheDocument();
  });

  it('redirects bare /search to /explorer', async () => {
    renderRedirect('/search');
    expect(await screen.findByTestId('explorer')).toBeInTheDocument();
  });
});
