/**
 * Shared constants for the graph page (Sprint C global view).
 *
 * Backend hard-caps `limit` at 50_000; the SPA default stays far below
 * that so the canvas stays interactive.
 */
export const DEFAULT_GLOBAL_NODE_BUDGET = 500;

export const GLOBAL_NODE_BUDGET_PRESETS = [250, 500, 1000, 2000] as const;

export type GraphViewMode = 'local' | 'global';
