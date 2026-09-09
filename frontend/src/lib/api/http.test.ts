import { describe, expect, it } from 'vitest';

import { ApiError } from './http';
import { parseApiErrorBody } from './error-body';
import { errorMessage } from '../errors';

describe('parseApiErrorBody', () => {
  it.each([
    [{ detail: 'Not found', code: 'law_not_found' }, { detail: 'Not found', code: 'law_not_found', retryAfterS: null }],
    [
      { detail: { message: 'CSRF failed', code: 'csrf_failed' } },
      { detail: 'CSRF failed', code: 'csrf_failed', retryAfterS: null },
    ],
    [
      { detail: { message: 'Slow down', error: 'rate_limited', retry_after_s: 12 } },
      { detail: 'Slow down', code: 'rate_limited', retryAfterS: 12 },
    ],
    [
      { detail: [{ type: 'int_parsing', loc: ['query', 'page'], msg: 'Invalid page' }] },
      { detail: 'Invalid page', code: 'validation_error', retryAfterS: null },
    ],
  ])('parses %j', (body, expected) => {
    expect(parseApiErrorBody(body)).toEqual(expected);
  });
});

describe('ApiError readers', () => {
  it('never falls back to GET /path for flat envelopes', () => {
    const err = new ApiError(404, { detail: 'Missing', code: 'law_not_found' }, 'GET /laws/x');
    expect(err.detail).toBe('Missing');
    expect(err.code).toBe('law_not_found');
  });

  it('reads nested detail.message and detail.error', () => {
    const err = new ApiError(
      429,
      { detail: { message: 'Slow down', error: 'rate_limited', retry_after_s: 5 } },
      'POST /chat/send',
    );
    expect(err.detail).toBe('Slow down');
    expect(err.code).toBe('rate_limited');
  });
});

describe('errorMessage', () => {
  it.each([
    [new ApiError(404, { detail: 'x', code: 'law_not_found' }, 'GET /laws/x'), 'No se encontró la norma solicitada.'],
    [new ApiError(500, { detail: 'x', code: 'internal_error' }, 'GET /x'), 'Ha ocurrido un error inesperado. Inténtalo de nuevo.'],
    [new ApiError(422, { detail: [{ msg: 'bad tag' }] }, 'GET /diff'), 'La petición no es válida.'],
    [new ApiError(503, {}, 'GET /warmup'), 'Error del servidor. Inténtalo de nuevo más tarde.'],
    [new Error('Failed to fetch'), 'No se pudo conectar con el servidor.'],
  ])('never surfaces method/path for %p', (err, expected) => {
    const message = errorMessage(err);
    expect(message).toBe(expected);
    expect(message).not.toMatch(/GET \//);
    expect(message).not.toMatch(/POST \//);
  });
});
