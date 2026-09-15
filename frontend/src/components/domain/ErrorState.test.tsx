import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';

import i18n from '@/i18n';
import { ApiError } from '@/lib/api/http';
import { ErrorState } from './ErrorState';

beforeAll(async () => {
  await i18n.changeLanguage('es');
});

describe('ErrorState', () => {
  it('shows a human message in normal body text', () => {
    render(
      <ErrorState error={new ApiError(404, { detail: 'x', code: 'law_not_found' }, 'GET /laws/x')} />,
    );
    expect(screen.getByText('No se encontró la norma solicitada.')).toBeInTheDocument();
    expect(screen.queryByText(/GET \/laws/)).not.toBeInTheDocument();
  });

  it('folds technical detail behind a disclosure', async () => {
    render(
      <ErrorState error={new ApiError(500, { detail: 'db timeout', code: 'internal_error' }, 'GET /x')} />,
    );
    expect(screen.getByText(/error inesperado/i)).toBeInTheDocument();
    expect(screen.queryByText(/HTTP 500/)).not.toBeVisible();
    await userEvent.click(screen.getByText(/detalles técnicos/i));
    expect(screen.getByText(/HTTP 500/)).toBeVisible();
    expect(screen.getByText(/db timeout/)).toBeVisible();
  });
});
