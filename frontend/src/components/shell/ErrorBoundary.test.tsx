import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import i18n from '@/i18n';
import { ErrorBoundary } from './ErrorBoundary';

beforeAll(async () => {
  await i18n.changeLanguage('es');
});

function Boom(): null {
  throw new Error('Failed to fetch dynamically imported module: https://example.com/assets/Page.js');
}

function RenderBoom(): null {
  throw new Error('plain render failure');
}

describe('ErrorBoundary', () => {
  it('shows reload-only UX for chunk load errors without raw URLs', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/nueva versión disponible/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /recargar/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reintentar/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/example\.com/)).not.toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('shows retry and error detail for non-chunk errors', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <RenderBoom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('plain render failure')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
