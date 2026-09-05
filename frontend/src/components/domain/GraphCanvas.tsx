/**
 * Knowledge-graph canvas — force-directed WebGL-class view (#596).
 *
 * Replaces the react-flow DOM/SVG radial layout (which looked flat and
 * couldn't scale past a few hundred nodes) with `react-force-graph-2d`:
 * a single HTML5 canvas + d3-force simulation. Handles thousands of nodes
 * at 60 fps, Obsidian-style.
 *
 * Public API (props + onSelect contract) is unchanged so `GraphPage.tsx`
 * doesn't move.
 *
 * Design notes:
 * * `graphData` is memoised on `data` ONLY — selection and kind-filter
 *   changes must NOT rebuild it, or the simulation restarts on every
 *   click. Dim + selection state are read live inside the paint closures.
 * * Labels are drawn only for the selected node or when zoomed past
 *   `LABEL_ZOOM` — this kills the label-overlap soup at default zoom (#569).
 * * Colours come from `lib/graph-colors.ts` (literal HSL strings, so the
 *   canvas can use them directly — CSS `var(--x)` would not resolve here).
 *   The label colour is the one theme token we resolve at runtime.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * * Palette        → `lib/graph-colors.ts`.
 * * Node sizing    → `BASE_RADIUS` + `nodeRadius`.
 * * Label density  → `LABEL_ZOOM`.
 * * Forces         → the `d3Force` tweaks in the mount effect.
 * * Kind filters   → dim filtered-out kinds (`DIM_ALPHA`); nodes stay in
 *   the simulation so layout stays stable (hide would restart forces).
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';

import {
  EDGE_KIND_LABELS,
  GRAPH_EDGE_STROKE,
  NODE_KIND_LABELS,
  paintNode,
  resolveCommunityFill,
  resolveLabelColor,
} from '@/lib/graph-colors';
import { useUi } from '@/lib/store';
import type { GraphData, GraphEdge, GraphNodeKind } from '@/lib/types';
import { cn } from '@/lib/utils';

export interface GraphCanvasProps {
  data: GraphData;
  visibleKinds: Set<GraphNodeKind>;
  selected: string | null;
  onSelect: (id: string) => void;
  /** When set, nodes outside this set are dimmed (search / advanced filters). */
  matchNodeIds?: Set<string> | null;
  /** Path overlay — node ids to keep bright. */
  highlightNodeIds?: ReadonlySet<string> | null;
  /** Path overlay — directed `source\\ttarget` keys from `edgeKey()`. */
  highlightEdgeKeys?: ReadonlySet<string> | null;
  /** Level-of-detail profile; global hides labels/edges until zoomed in. */
  lodProfile?: 'local' | 'global';
  className?: string;
}

/** Imperative controls exposed to GraphPage's zoom toolbar (#830). */
export interface GraphCanvasHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  centerAt: (nodeId: string) => void;
  exportPng: (filename?: string) => void;
}

/** Node shape fed to the force engine (it mutates x/y/vx/vy in place). */
interface FGNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  pagerank: number;
  community: number;
  status: string;
  rank: string;
  x?: number;
  y?: number;
}

interface FGLink {
  source: string | FGNode;
  target: string | FGNode;
  kind?: NonNullable<GraphEdge['kind']>;
}

/** Base node radius (graph units) per kind; laws anchor, the rest ring them. */
const BASE_RADIUS: Record<GraphNodeKind, number> = {
  law: 7,
  article: 4.5,
  reference: 4.5,
  amendment: 4.5,
  repealed: 5,
};

const LABEL_ZOOM = 1.3;
const LABEL_ZOOM_GLOBAL = 2.4;
const EDGE_ZOOM_GLOBAL = 0.8;
const EDGE_DIM_GLOBAL_ALPHA = 0.15;
const LINK_LABEL_EDGE_CAP = 400;
const DIM_ALPHA = 0.18;
const HIGHLIGHT_DIM_ALPHA = 0.12;

function nodeRadius(node: FGNode): number {
  const base = BASE_RADIUS[node.kind] ?? 4.5;
  // PageRank within a subgraph is tiny (sums to 1); scale generously but cap.
  return base + Math.min(7, node.pagerank * 45);
}

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Append an alpha to a literal ``hsl(h s% l%)`` string for canvas use. */
function withAlpha(hsl: string, alpha: number): string {
  return hsl.replace(')', ` / ${alpha})`);
}

function resolveCanvasBackground(): string {
  if (typeof document === 'undefined') return '#0f1117';
  const value = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  return value ? `hsl(${value})` : '#0f1117';
}

/** Directed edge key — keep in sync with `pages/graph/graph-path-utils.edgeKey`. */
function directedEdgeKey(source: string, target: string): string {
  return `${source}\t${target}`;
}

function endpointId(end: string | FGNode): string {
  return typeof end === 'object' ? end.id : end;
}

export const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(function GraphCanvas(
  {
    data,
    visibleKinds,
    selected,
    onSelect,
    matchNodeIds,
    highlightNodeIds,
    highlightEdgeKeys,
    lodProfile = 'local',
    className,
  },
  ref,
) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<FGNode, FGLink> | undefined>(undefined);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // `reduced` starts from the current OS preference but updates at runtime
  // when the user toggles reduced-motion in system settings (see the
  // matchMedia change-listener effect below).
  const [reduced, setReduced] = useState(prefersReducedMotion);
  const theme = useUi((s) => s.theme);

  // Stable across selection + filter changes (depends on `data` only) so the
  // simulation never restarts on a click or a chip toggle.
  const graphData = useMemo(() => {
    const nodes = data.nodes.map(
      (n): FGNode => ({
        id: n.id,
        kind: n.kind,
        label: n.label,
        pagerank: typeof n.meta?.pagerank === 'number' ? n.meta.pagerank : 0,
        community: typeof n.meta?.community === 'number' ? n.meta.community : 0,
        status: String(n.meta?.status ?? ''),
        rank: String(n.meta?.rank ?? ''),
      }),
    );
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links = data.edges.map((e): FGLink => ({ source: e.source, target: e.target, kind: e.kind }));
    return { nodes, links, byId };
  }, [data]);

  const adjacencyIndex = useMemo(() => {
    const adjacency = new Map<string, Set<string>>();
    const link = (a: string, b: string) => {
      const bucket = adjacency.get(a) ?? new Set<string>();
      bucket.add(b);
      adjacency.set(a, bucket);
    };
    for (const edge of data.edges) {
      link(edge.source, edge.target);
      link(edge.target, edge.source);
    }
    return adjacency;
  }, [data.edges]);

  const highlightNeighbourhood = useMemo(() => {
    const focusId = hoveredId ?? selected;
    if (!focusId) return null;
    const neighbourhood = new Set<string>([focusId]);
    const neighbours = adjacencyIndex.get(focusId);
    if (neighbours) {
      for (const id of neighbours) neighbourhood.add(id);
    }
    return neighbourhood;
  }, [hoveredId, selected, adjacencyIndex]);

  // Re-read label + node fills whenever the UI theme flips (`data-theme`).
  const labelColor = resolveLabelColor();

  // --- Auto-fit / imperative zoom (#830) ---------------------------------
  const hasFitRef = useRef(false);
  const userZoomedRef = useRef(false);
  const suppressZoomRef = useRef(false);

  const fitView = useCallback((ms = 400) => {
    const fg = fgRef.current;
    if (!fg) return;
    suppressZoomRef.current = true;
    fg.zoomToFit(ms, size.w < 480 ? 24 : 72);
    window.setTimeout(() => {
      suppressZoomRef.current = false;
    }, ms + 150);
    hasFitRef.current = true;
  }, [size.w]);

  const centerOnNode = useCallback((nodeId: string) => {
    const fg = fgRef.current;
    const node = graphData.byId.get(nodeId);
    if (!fg || !node || node.x == null || node.y == null) return;
    suppressZoomRef.current = true;
    fg.centerAt(node.x, node.y, 400);
    window.setTimeout(() => {
      suppressZoomRef.current = false;
    }, 550);
  }, [graphData.byId]);

  const exportPng = useCallback((filename = 'lexflow-graph.png') => {
    const canvas = wrapperRef.current?.querySelector('canvas');
    if (!canvas) return;

    const offscreen = document.createElement('canvas');
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = resolveCanvasBackground();
    ctx.fillRect(0, 0, offscreen.width, offscreen.height);
    ctx.drawImage(canvas, 0, 0);

    const url = offscreen.toDataURL('image/png');
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => {
        const fg = fgRef.current;
        if (fg) fg.zoom(fg.zoom() * 1.4, 250);
      },
      zoomOut: () => {
        const fg = fgRef.current;
        if (fg) fg.zoom(fg.zoom() / 1.4, 250);
      },
      fit: () => {
        userZoomedRef.current = false;
        fitView(400);
      },
      centerAt: (nodeId: string) => centerOnNode(nodeId),
      exportPng: (filename?: string) => exportPng(filename),
    }),
    [fitView, centerOnNode, exportPng],
  );

  useEffect(() => {
    hasFitRef.current = false;
    userZoomedRef.current = false;
  }, [graphData]);

  useEffect(() => {
    if (size.w === 0 || size.h === 0 || userZoomedRef.current) return;
    const id = window.setTimeout(() => fitView(400), 600);
    return () => window.clearTimeout(id);
  }, [graphData, size.w, size.h, fitView]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: Math.max(0, Math.floor(r.width)), h: Math.max(0, Math.floor(r.height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [onScreen, setOnScreen] = useState(true);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => setOnScreen(entries[0].isIntersecting), { threshold: 0 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    const shouldAnimate = onScreen && !reduced;
    if (shouldAnimate) {
      fgRef.current?.resumeAnimation();
    } else {
      fgRef.current?.pauseAnimation();
    }
  }, [onScreen, reduced]);

  const isVisible = useCallback((kind: GraphNodeKind) => visibleKinds.has(kind), [visibleKinds]);
  const resolve = (end: string | FGNode): FGNode | undefined =>
    typeof end === 'object' ? end : graphData.byId.get(end);

  const nodeAlpha = useCallback(
    (node: FGNode): number => {
      let alpha = isVisible(node.kind) ? 1 : DIM_ALPHA;
      if (matchNodeIds && !matchNodeIds.has(node.id)) alpha = Math.min(alpha, DIM_ALPHA);
      if (highlightNodeIds && highlightNodeIds.size > 0) {
        alpha = highlightNodeIds.has(node.id) ? Math.max(alpha, 1) : Math.min(alpha, HIGHLIGHT_DIM_ALPHA);
      } else if (highlightNeighbourhood && !highlightNeighbourhood.has(node.id)) {
        alpha = Math.min(alpha, HIGHLIGHT_DIM_ALPHA);
      }
      return alpha;
    },
    [isVisible, matchNodeIds, highlightNeighbourhood, highlightNodeIds],
  );

  const nodeLabel = useCallback((n: FGNode) => {
    const node = n as FGNode;
    const kind = NODE_KIND_LABELS[node.kind];
    const pagerank = node.pagerank > 0 ? `\nPageRank: ${node.pagerank.toFixed(3)}` : '';
    return `${node.label}\n${kind}${pagerank}`;
  }, []);

  const linkLabel = useCallback(
    (l: FGLink) => {
      if (lodProfile === 'global' && graphData.links.length > LINK_LABEL_EDGE_CAP) return '';
      const link = l as FGLink;
      const source = typeof link.source === 'object' ? link.source : graphData.byId.get(link.source);
      const target = typeof link.target === 'object' ? link.target : graphData.byId.get(link.target);
      const kind = EDGE_KIND_LABELS[link.kind ?? 'cites'];
      if (!source || !target) return kind;
      return `${kind}\n${source.label} → ${target.label}`;
    },
    [graphData.byId, graphData.links.length, lodProfile],
  );

  return (
    <div ref={wrapperRef} className={cn('size-full', className)} data-testid="graph-canvas">
      {size.w > 0 && size.h > 0 && (
        <ForceGraph2D
          key={theme}
          ref={fgRef}
          width={size.w}
          height={size.h}
          graphData={graphData}
          backgroundColor="rgba(0,0,0,0)"
          warmupTicks={reduced ? 150 : lodProfile === 'global' ? 40 : 0}
          cooldownTicks={reduced ? 0 : lodProfile === 'global' ? 80 : 200}
          d3AlphaMin={0.02}
          onEngineStop={() => {
            if (!userZoomedRef.current) fitView(400);
          }}
          onZoomEnd={() => {
            if (!suppressZoomRef.current && hasFitRef.current) userZoomedRef.current = true;
          }}
          enableNodeDrag={false}
          minZoom={lodProfile === 'global' ? 0.15 : 0.4}
          maxZoom={6}
          nodeRelSize={1}
          onNodeClick={(n) => onSelect((n as FGNode).id)}
          onNodeHover={(n) => setHoveredId(n ? (n as FGNode).id : null)}
          onBackgroundClick={() => {
            if (selected) onSelect('');
          }}
          nodeLabel={(n) => nodeLabel(n as FGNode)}
          linkLabel={(l) => linkLabel(l as FGLink)}
          linkDirectionalArrowLength={() => 5 / (fgRef.current?.zoom() ?? 1)}
          linkDirectionalArrowColor={(l) => {
            const link = l as FGLink;
            return link.kind ? GRAPH_EDGE_STROKE[link.kind] : 'hsl(220 9% 50%)';
          }}
          linkColor={(l) => {
            const link = l as FGLink;
            const s = resolve(link.source);
            const t = resolve(link.target);
            const dim =
              (s != null && !isVisible(s.kind)) ||
              (t != null && !isVisible(t.kind)) ||
              (matchNodeIds != null && s != null && t != null && (!matchNodeIds.has(s.id) || !matchNodeIds.has(t.id)));
            const onPath =
              highlightEdgeKeys != null &&
              highlightEdgeKeys.size > 0 &&
              highlightEdgeKeys.has(directedEdgeKey(endpointId(link.source), endpointId(link.target)));
            const inHighlight =
              !onPath &&
              highlightEdgeKeys == null &&
              highlightNeighbourhood != null &&
              s != null &&
              t != null &&
              highlightNeighbourhood.has(s.id) &&
              highlightNeighbourhood.has(t.id);
            const base = link.kind ? GRAPH_EDGE_STROKE[link.kind] : 'hsl(220 9% 50%)';
            if (onPath) return withAlpha(base, 0.95);
            if (inHighlight) return withAlpha(base, 0.85);
            const scale = fgRef.current?.zoom() ?? 1;
            if (lodProfile === 'global' && scale < EDGE_ZOOM_GLOBAL) {
              return withAlpha(base, EDGE_DIM_GLOBAL_ALPHA);
            }
            return withAlpha(base, dim ? 0.06 : 0.5);
          }}
          linkWidth={(l) => {
            const link = l as FGLink;
            const s = resolve(link.source);
            const t = resolve(link.target);
            const onPath =
              highlightEdgeKeys != null &&
              highlightEdgeKeys.size > 0 &&
              highlightEdgeKeys.has(directedEdgeKey(endpointId(link.source), endpointId(link.target)));
            const inHighlight =
              !onPath &&
              highlightEdgeKeys == null &&
              highlightNeighbourhood != null &&
              s != null &&
              t != null &&
              highlightNeighbourhood.has(s.id) &&
              highlightNeighbourhood.has(t.id);
            if (onPath) return 2.5;
            return inHighlight ? 2 : 1;
          }}
          nodeCanvasObjectMode={() => 'replace'}
          nodeCanvasObject={(n, ctx, scale) => {
            const node = n as FGNode;
            const x = node.x ?? 0;
            const y = node.y ?? 0;
            const r = nodeRadius(node);
            const isSel = node.id === selected;
            const fill = resolveCommunityFill(node.community);

            ctx.save();
            ctx.globalAlpha = nodeAlpha(node);

            paintNode(ctx, { x, y, radius: r, kind: node.kind, fill, scale, selected: isSel });

            const labelZoom = lodProfile === 'global' ? LABEL_ZOOM_GLOBAL : LABEL_ZOOM;
            const showLabel =
              isVisible(node.kind) &&
              (isSel || node.id === hoveredId || (highlightNodeIds?.has(node.id) ?? false) || scale > labelZoom);
            if (showLabel) {
              const fontSize = 12 / scale;
              ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              ctx.fillStyle = labelColor;
              const maxLen = size.w < 480 ? 28 : 42;
              const label = node.label.length > maxLen ? `${node.label.slice(0, maxLen - 1)}…` : node.label;
              ctx.fillText(label, x, y + r + 2 / scale);
            }
            ctx.restore();
          }}
          nodePointerAreaPaint={(n, color, ctx) => {
            const node = n as FGNode;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x ?? 0, node.y ?? 0, nodeRadius(node) + 2, 0, 2 * Math.PI);
            ctx.fill();
          }}
        />
      )}
    </div>
  );
});
