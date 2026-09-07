/**
 * Tests for LawHeader metadata: last_updated formatting and BOE link (#33).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LawHeader } from './LawHeader';
import type { Law } from '@/lib/types';
import { formatDate } from '@/lib/utils';

const baseLaw: Law = {
  id: 'BOE-A-2018-16673',
  boe: 'BOE-A-2018-16673',
  title: 'Ley Orgánica 3/2018',
  short: 'LOPDGDD',
  status: 'vigente',
  rango: 'Ley Orgánica',
  publicada: '2018-12-06',
  ambito: 'Estatal',
  articulos: 97,
  referencias: 12,
  versiones: 4,
};

describe('LawHeader', () => {
  it('renders the formatted last-modified date and a BOE link', () => {
    render(
      <LawHeader
        law={{
          ...baseLaw,
          ultimaModificacion: '2024-03-05',
          sourceUrl: 'https://www.boe.es/buscar/act.php?id=BOE-A-2018-16673',
        }}
      />,
    );

    expect(screen.getByText(formatDate('2024-03-05'))).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /ver en BOE/i });
    expect(link).toHaveAttribute('href', 'https://www.boe.es/buscar/act.php?id=BOE-A-2018-16673');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel') ?? '').toMatch(/noopener/);
    expect(link.getAttribute('rel') ?? '').toMatch(/noreferrer/);
  });

  it('shows an em dash when ultimaModificacion is missing', () => {
    render(<LawHeader law={baseLaw} />);
    expect(screen.getByText('Última modificación').nextElementSibling?.textContent).toBe('—');
  });
});
