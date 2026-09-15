import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api/http';
import { errorDisplay } from './errors';

describe('errorDisplay', () => {
  it('keeps ApiError human message separate from HTTP detail', () => {
    const err = new ApiError(404, { detail: 'x', code: 'law_not_found' }, 'GET /laws/x');
    const { message, detail } = errorDisplay(err);
    expect(message).toBe('No se encontró la norma solicitada.');
    expect(detail).toMatch(/HTTP 404/);
    expect(detail).not.toMatch(/GET \/laws/);
  });

  it('returns only message for generic network errors', () => {
    const { message, detail } = errorDisplay(new Error('Failed to fetch'));
    expect(message).toBe('No se pudo conectar con el servidor.');
    expect(detail).toBeUndefined();
  });
});
