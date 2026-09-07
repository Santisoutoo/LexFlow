/** Shared Recharts styling for dashboard sparklines and hero charts. */
import { GRAPH_KIND_FILL, GRAPH_PRIMARY, GRAPH_PRIMARY_FILL_SOFT } from '@/lib/graph-colors';

export const CHART_PRIMARY = GRAPH_PRIMARY;
export const CHART_RECENT = GRAPH_KIND_FILL.article;

export const CHART_THEME = {
  margin: {
    spark: { top: 4, right: 0, bottom: 0, left: 0 },
    hero: { top: 12, right: 12, bottom: 0, left: -8 },
  },
  tick: { fontSize: 11, fill: 'hsl(var(--muted-fg))' },
  grid: { strokeDasharray: '3 3', stroke: 'hsl(var(--border))', vertical: false },
  cursor: { stroke: 'hsl(var(--border-strong))', strokeDasharray: '3 3' },
  area: {
    spark: {
      strokeWidth: 2,
      gradientTop: { stopColor: CHART_PRIMARY, stopOpacity: 0.3 },
      gradientBottom: { stopColor: CHART_PRIMARY, stopOpacity: 0 },
    },
    hero: {
      strokeWidth: 2.5,
      gradientTop: { stopColor: CHART_PRIMARY, stopOpacity: 0.28 },
      gradientBottom: { stopColor: CHART_PRIMARY, stopOpacity: 0.02 },
      dot: { r: 2.5, fill: CHART_PRIMARY, strokeWidth: 0 },
      activeDot: { r: 4, fill: CHART_PRIMARY, stroke: 'hsl(var(--bg))', strokeWidth: 2 },
    },
  },
  referenceArea: { fillOpacity: 0.07, strokeOpacity: 0 },
  recentTint: CHART_RECENT,
  primaryFillSoft: GRAPH_PRIMARY_FILL_SOFT,
} as const;
