/**
 * Single source of truth for the legal-graph node palette.
 *
 * Used by:
 * - `components/domain/GraphCanvas.tsx` (node fills + selection halo)
 * - `pages/GraphPage.tsx`               (legend + filter chips)
 * - `pages/DashboardPage.tsx`           (sparkline + bar accents)
 *
 * Before this module the same five HSL strings lived inline in three
 * places; the audit (`memory/feedback_*` if added) flagged it as
 * drift-prone. Touch the palette here and everything follows.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * * New node kind         → extend `GraphNodeKind` in `lib/types.ts` and
 *                           add a colour here. TypeScript will fail any
 *                           consumer that forgets to handle the new kind.
 * * Recolour brand        → swap the HSL string here; consumers update
 *                           automatically.
 * * Tailwind / CSS tokens → `--graph-*` tokens in `index.css`; resolved at
 *                           paint time via `resolveGraphKindFill`.
 */

import type { GraphEdge, GraphNodeKind } from './types';

const GRAPH_KIND_CSS_VAR: Record<GraphNodeKind, string> = {
  law: '--graph-law',
  article: '--graph-article',
  reference: '--graph-reference',
  amendment: '--graph-amendment',
  repealed: '--graph-repealed',
};

/**
 * Resolve an HSL CSS token (channel triple under `--token`) for canvas use.
 */
export function resolveCssHslToken(token: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    return value ? `hsl(${value})` : fallback;
  } catch {
    return fallback;
  }
}

/** Theme-aware node fill — reads `--graph-*` tokens with literal fallback. */
export function resolveGraphKindFill(kind: GraphNodeKind): string {
  return resolveCssHslToken(GRAPH_KIND_CSS_VAR[kind], GRAPH_KIND_FILL[kind]);
}

/** Theme-aware label colour — reads `--fg`. */
export function resolveLabelColor(): string {
  return resolveCssHslToken('--fg', '#9aa0aa');
}

/**
 * Edge kinds that the backend ships on `GraphEdge.kind` (#144). Mirrors
 * the union in `lib/types.ts` so this module remains the single
 * source of truth for the graph palette.
 */
export type GraphEdgeKind = NonNullable<GraphEdge['kind']>;

/**
 * Display label per node kind. Spanish on purpose — these are
 * legal-taxonomy categories (Ley / Artículo / …), kept untranslated like
 * rango/ámbito (see the i18n convention). Lives here, next to
 * `GRAPH_KIND_FILL`, so the canvas and the page share one source and the
 * canvas file stays a pure component module (react-refresh).
 */
export const NODE_KIND_LABELS: Record<GraphNodeKind, string> = {
  law: 'Ley',
  article: 'Artículo',
  reference: 'Referencia',
  amendment: 'Reforma',
  repealed: 'Derogada',
};

/** Solid fill per node kind. */
export const GRAPH_KIND_FILL: Record<GraphNodeKind, string> = {
  law: 'hsl(232 72% 52%)', // indigo — primary anchor
  article: 'hsl(36 95% 56%)', // amber  — accent / recent
  reference: 'hsl(266 65% 60%)', // violet
  amendment: 'hsl(195 70% 50%)', // cyan
  repealed: 'hsl(220 8% 55%)', // neutral grey
};

/**
 * Fixed HSL palette for modularity clusters (#24). Node fill colour is
 * community-driven; kind is encoded by shape instead.
 */
export const COMMUNITY_PALETTE: readonly string[] = [
  'hsl(232 72% 52%)',
  'hsl(36 95% 56%)',
  'hsl(195 70% 50%)',
  'hsl(266 65% 60%)',
  'hsl(150 55% 45%)',
  'hsl(0 70% 55%)',
  'hsl(280 60% 55%)',
  'hsl(20 85% 55%)',
  'hsl(170 50% 42%)',
  'hsl(310 55% 52%)',
  'hsl(55 80% 48%)',
  'hsl(210 55% 48%)',
  'hsl(95 45% 42%)',
  'hsl(350 65% 52%)',
];

/** Neutral fill when `community` is missing or zero (single-node subgraphs). */
export const COMMUNITY_NEUTRAL = 'hsl(220 9% 62%)';

/**
 * Resolve a stable fill colour for a modularity cluster id.
 *
 * @param communityId - Backend `community` field; `0`/missing → neutral.
 */
export function resolveCommunityFill(communityId: number | null | undefined): string {
  if (communityId == null || communityId === 0) return COMMUNITY_NEUTRAL;
  const idx = Math.abs(communityId) % COMMUNITY_PALETTE.length;
  return COMMUNITY_PALETTE[idx] ?? COMMUNITY_NEUTRAL;
}

/**
 * Brand indigo used for selection state, edge highlight and the bar /
 * sparkline charts. Same hue as `GRAPH_KIND_FILL.law` so the focus
 * accent visually pairs with the law nodes.
 */
export const GRAPH_PRIMARY = 'hsl(232 72% 52%)';

/**
 * Selection halo (large soft circle behind the focused node). 18 %
 * alpha so it reads as "there but not loud".
 */
export const GRAPH_PRIMARY_SOFT = 'hsl(232 72% 52% / 0.18)';

/** Outer glow on the selected node — slightly stronger than the halo. */
export const GRAPH_PRIMARY_GLOW = 'hsl(232 72% 52% / 0.55)';

/**
 * Translucent fill below sparkline / area-chart strokes (10 % alpha).
 * Same hue as :data:`GRAPH_PRIMARY` so charts and graph nodes read as
 * the same product.
 */
export const GRAPH_PRIMARY_FILL_SOFT = 'hsl(232 72% 52% / 0.10)';

/**
 * Stroke colour per edge kind. Hue grouped so an edge reads the same
 * "family" as the destination node when possible:
 * - ``cites``     → neutral indigo (links between norms, the bread-and-butter case)
 * - ``develops``  → cyan (downstream regulation/RD that develops a law)
 * - ``modifies``  → amber (mutates the target; same hue as ``article`` to flag change)
 * - ``repeals``   → red (destructive; only colour outside the existing palette)
 *
 * Falls back to ``border-strong`` (existing default) when the backend
 * omits ``kind`` (legacy edges from before #144).
 */
export const GRAPH_EDGE_STROKE: Record<GraphEdgeKind, string> = {
  cites: 'hsl(232 60% 60%)', // indigo (light)
  develops: 'hsl(195 65% 55%)', // cyan (matches `amendment` node)
  modifies: 'hsl(36 90% 55%)', // amber (matches `article` node)
  repeals: 'hsl(0 70% 55%)', // red
};

/**
 * Spanish-first display label per edge kind. Used by the canvas legend
 * and any tooltip / filter chip that lists edge kinds.
 */
export const EDGE_KIND_LABELS: Record<GraphEdgeKind, string> = {
  cites: 'Cita',
  develops: 'Desarrolla',
  modifies: 'Modifica',
  repeals: 'Deroga',
};

/** Options for the shared canvas node painter (#24). */
export interface PaintNodeOptions {
  x: number;
  y: number;
  radius: number;
  kind: GraphNodeKind;
  fill: string;
  scale: number;
  selected: boolean;
}

function strokeDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
}

function strokeTriangle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const h = r * 1.15;
  ctx.moveTo(x, y - h);
  ctx.lineTo(x + r, y + h * 0.6);
  ctx.lineTo(x - r, y + h * 0.6);
  ctx.closePath();
}

/**
 * Draw a graph node on canvas — community drives fill; kind drives shape.
 */
export function paintNode(ctx: CanvasRenderingContext2D, opts: PaintNodeOptions): void {
  const { x, y, radius, kind, fill, scale, selected } = opts;

  if (selected) {
    ctx.beginPath();
    ctx.arc(x, y, radius + 5, 0, 2 * Math.PI);
    ctx.fillStyle = GRAPH_PRIMARY_SOFT;
    ctx.fill();
  }

  ctx.beginPath();
  switch (kind) {
    case 'law':
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = fill;
      ctx.fill();
      break;
    case 'article': {
      const inner = radius * 0.85;
      ctx.arc(x, y, inner, 0, 2 * Math.PI);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 1.5 / scale;
      ctx.strokeStyle = 'hsl(0 0% 100% / 0.85)';
      ctx.stroke();
      break;
    }
    case 'reference':
      strokeDiamond(ctx, x, y, radius);
      ctx.fillStyle = fill;
      ctx.fill();
      break;
    case 'amendment':
      strokeTriangle(ctx, x, y, radius);
      ctx.fillStyle = fill;
      ctx.fill();
      break;
    case 'repealed':
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.lineWidth = 2 / scale;
      ctx.setLineDash([3 / scale, 2 / scale]);
      ctx.strokeStyle = fill;
      ctx.globalAlpha *= 0.75;
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    default:
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = fill;
      ctx.fill();
  }

  if (selected) {
    ctx.beginPath();
    if (kind === 'reference') strokeDiamond(ctx, x, y, radius);
    else if (kind === 'amendment') strokeTriangle(ctx, x, y, radius);
    else ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.lineWidth = 2 / scale;
    ctx.strokeStyle = GRAPH_PRIMARY;
    ctx.stroke();
  }
}

