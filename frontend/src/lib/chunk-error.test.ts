import { describe, expect, it } from 'vitest';

import { isChunkLoadError } from './chunk-error';

describe('isChunkLoadError', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://example.com/assets/GraphPage-abc.js',
    'Importing a module script failed.',
    'Loading chunk 42 failed.',
  ])('detects chunk load message: %s', (message) => {
    expect(isChunkLoadError(new Error(message))).toBe(true);
  });

  it('returns false for ordinary render errors', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError('not an error')).toBe(false);
  });
});
