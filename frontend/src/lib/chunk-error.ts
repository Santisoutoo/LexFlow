/**
 * Detect Vite / browser dynamic-import failures after a deploy.
 *
 * These errors are not recoverable via React state reset — the hashed
 * chunk URL is stale and only a full reload fixes it.
 */

const CHUNK_LOAD_PATTERNS = [
  'Failed to fetch dynamically imported module',
  'Importing a module script failed',
  /Loading chunk \d+ failed/,
] as const;

/** Return whether *error* looks like a stale lazy-chunk load failure. */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message;
  return CHUNK_LOAD_PATTERNS.some((pattern) =>
    typeof pattern === 'string' ? message.includes(pattern) : pattern.test(message),
  );
}
