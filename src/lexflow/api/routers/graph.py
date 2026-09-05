"""Graph endpoints for the legal knowledge graph.

The :class:`~lexflow.graph.model.LegalGraph` singleton lives in
:func:`lexflow.api.dependencies.get_graph` so tests can override it with
``app.dependency_overrides[get_graph]`` and the sync router can invalidate
it without reaching into this module's globals.
"""

from __future__ import annotations

from typing import Annotated

import networkx as nx
from fastapi import APIRouter, Depends, HTTPException, Query

from lexflow.api.dependencies import get_graph
from lexflow.core.enums import LawRank, LawStatus, Scope
from lexflow.core.schemas import (
    GraphEdgeData,
    GraphGlobalResponse,
    GraphNeighborsResponse,
    GraphNodeData,
    GraphPathResponse,
    GraphStatsResponse,
    GraphSubgraphResponse,
    GraphTopItem,
    GraphTopResponse,
)
from lexflow.graph.algorithms import PAGERANK_DECIMALS, shortest_path, top_laws
from lexflow.graph.model import LegalGraph

_NODE_META_KEYS = frozenset({"title", "rank", "status"})

router = APIRouter(prefix="/graph", tags=["Graph"])


# Hard ceiling so an honest "give me everything" query (limit unset) on a
# corpus growing past tens of thousands of laws doesn't accidentally
# serialise the universe. legalize-es is at ~12k today; 50k is the next
# decade's headroom. Hit this and the client should narrow with filters.
_GLOBAL_GRAPH_HARD_CAP = 50_000


def _node_matches_filters(
    attrs: dict[str, object],
    *,
    status: LawStatus | None,
    rank: LawRank | None,
    scope: Scope | None,
    jurisdiction: str | None,
) -> bool:
    """Return whether a node's metadata satisfies every active filter.

    Each ``None`` filter means "any value". String comparison matches the
    way ``add_law`` stores the attributes (``enum.value``), so the caller
    can pass enums or raw strings interchangeably.
    """
    if status is not None and attrs.get("status") != status.value:
        return False
    if rank is not None and attrs.get("rank") != rank.value:
        return False
    if scope is not None and attrs.get("scope") != scope.value:
        return False
    return not (jurisdiction is not None and attrs.get("jurisdiction") != jurisdiction)


@router.get("", response_model=GraphGlobalResponse)
def get_global_graph(
    graph: Annotated[LegalGraph, Depends(get_graph)],
    status: LawStatus | None = Query(None, description="Filter by enforcement status"),
    rank: LawRank | None = Query(None, description="Filter by hierarchical rank"),
    scope: Scope | None = Query(None, description="Filter by territorial scope"),
    jurisdiction: str | None = Query(None, description="Filter by jurisdiction code (e.g. es-md)"),
    limit: int | None = Query(
        None,
        ge=1,
        le=_GLOBAL_GRAPH_HARD_CAP,
        description="Return only the top-N matching nodes by PageRank. Omit to return everything.",
    ),
) -> GraphGlobalResponse:
    """Return the whole graph (no seed) — Obsidian-style corpus view (#146).

    Walk every node, apply the metadata filters, optionally truncate to
    the top-``limit`` by PageRank, and return the induced subgraph (only
    edges where both endpoints survived the filter+truncate pass).
    """
    g = graph.graph
    matching = [
        n
        for n in g.nodes
        if _node_matches_filters(g.nodes[n], status=status, rank=rank, scope=scope, jurisdiction=jurisdiction)
    ]
    total_available = len(matching)
    if limit is not None and total_available > limit:
        matching.sort(key=lambda nid: _pagerank_attr(g, nid), reverse=True)
        matching = matching[:limit]
    selected = set(matching)
    sub = g.subgraph(selected).copy()
    pagerank_by_node, community_by_node = _analytics_maps(sub, subgraph_scoped=False)
    nodes = _assemble_nodes(sub, pagerank_by_node, community_by_node)
    edges = _assemble_edges(sub)
    returned_count = len(nodes)
    return GraphGlobalResponse(
        nodes=nodes,
        edges=edges,
        total_available=total_available,
        truncated=returned_count < total_available,
        limit_applied=limit,
        returned_count=returned_count,
    )


@router.get("/neighbors/{law_id}", response_model=GraphNeighborsResponse)
def get_neighbors(
    law_id: str,
    graph: Annotated[LegalGraph, Depends(get_graph)],
) -> GraphNeighborsResponse:
    """Return the direct successors (outgoing references) of a law node."""
    neighbors = graph.get_neighbors(law_id)
    return GraphNeighborsResponse(law_id=law_id, neighbors=neighbors, count=len(neighbors))


@router.get("/path", response_model=GraphPathResponse)
def get_path(
    from_id: Annotated[str, Query(alias="from")],
    to_id: Annotated[str, Query(alias="to")],
    graph: Annotated[LegalGraph, Depends(get_graph)],
) -> GraphPathResponse:
    """Return the shortest directed path between two law nodes.

    Query params use the `from` / `to` aliases (matches the convention of
    the versions diff endpoint and the documented example in the README).

    Sprint 6 api-6: wraps the path list in an object so the response has
    room to carry metadata later (e.g. path length, intermediate hops).
    """
    try:
        return GraphPathResponse(path=shortest_path(graph, from_id, to_id))
    except (nx.NetworkXNoPath, nx.NodeNotFound) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/subgraph/{law_id}", response_model=GraphSubgraphResponse)
def get_subgraph(
    law_id: str,
    graph: Annotated[LegalGraph, Depends(get_graph)],
    depth: int = Query(1, ge=1, le=3),
) -> GraphSubgraphResponse:
    """Return the ego-subgraph around a law node up to a given depth.

    Returns 404 if the law id is not a node in the graph — `get_subgraph`
    on `LegalGraph` walks `successors`/`predecessors` which raise
    `NetworkXError` on unknown nodes; we want a controlled response.
    """
    if law_id not in graph.graph:
        raise HTTPException(status_code=404, detail=f"Law id not in graph: {law_id}")
    sub = graph.get_subgraph(law_id, depth=depth)
    pagerank_by_node, community_by_node = _analytics_maps(sub, subgraph_scoped=True)
    nodes = _assemble_nodes(sub, pagerank_by_node, community_by_node)
    edges = _assemble_edges(sub)
    return GraphSubgraphResponse(nodes=nodes, edges=edges)


def _pagerank_attr(g: nx.DiGraph, node_id: str) -> float:
    """Read persisted PageRank; missing attrs sort as 0.0 (pre-v5 cache)."""
    raw = g.nodes[node_id].get("pagerank", 0.0)
    try:
        return float(raw)
    except (TypeError, ValueError):
        return 0.0


def _has_persisted_analytics(g: nx.DiGraph) -> bool:
    """True when every node already carries build-time pagerank + community."""
    return all("pagerank" in attrs and "community" in attrs for _, attrs in g.nodes(data=True))


def _analytics_maps(g: nx.DiGraph, *, subgraph_scoped: bool) -> tuple[dict[str, float], dict[str, int]]:
    """PageRank + community maps for a (sub)graph.

    Subgraph responses keep neighbourhood-scoped scores (PageRank sums to
    ~1 in the visible set). Global responses read persisted corpus-wide
    attrs; missing attrs fall back to a one-shot enrich so pre-v5 caches
    still answer until the version bump rebuilds them.
    """
    if subgraph_scoped or not _has_persisted_analytics(g):
        return _enrich_subgraph(g)
    pagerank_by_node: dict[str, float] = {}
    community_by_node: dict[str, int] = {}
    for node_id, attrs in g.nodes(data=True):
        raw_pr = attrs.get("pagerank")
        if isinstance(raw_pr, (int, float)) and not isinstance(raw_pr, bool):
            pagerank_by_node[node_id] = round(float(raw_pr), PAGERANK_DECIMALS)
        raw_comm = attrs.get("community")
        if isinstance(raw_comm, int) and not isinstance(raw_comm, bool):
            community_by_node[node_id] = raw_comm
    return pagerank_by_node, community_by_node


def _assemble_nodes(
    g: nx.DiGraph,
    pagerank_by_node: dict[str, float],
    community_by_node: dict[str, int],
) -> list[GraphNodeData]:
    return [
        GraphNodeData(
            id=n,
            **{k: v for k, v in g.nodes[n].items() if k in _NODE_META_KEYS},
            community=community_by_node.get(n),
            pagerank=pagerank_by_node.get(n),
        )
        for n in g.nodes
    ]


def _assemble_edges(g: nx.DiGraph) -> list[GraphEdgeData]:
    return [
        GraphEdgeData(
            source=u,
            target=v,
            source_article=g.edges[u, v].get("source_article"),
            kind=g.edges[u, v].get("kind"),
        )
        for u, v in g.edges
    ]


def _enrich_subgraph(sub: nx.DiGraph) -> tuple[dict[str, float], dict[str, int]]:
    """Compute per-node PageRank + community over the *subgraph*.

    Both are scoped to ``sub`` (not the global graph) so they stay
    coherent as the seed/depth change: PageRank sums to ~1 within the
    returned set, and community ids index the clusters visible on screen.

    Returns ``(pagerank_by_node, community_by_node)``. Empty dicts for an
    empty subgraph so the caller's ``.get(n)`` simply yields ``None``.
    """
    if sub.number_of_nodes() == 0:
        return {}, {}
    pagerank_by_node: dict[str, float] = {
        node: round(score, PAGERANK_DECIMALS) for node, score in nx.pagerank(sub).items()
    }
    # greedy_modularity needs an undirected view. Each returned set is one
    # community; index them so the frontend can map id → colour.
    community_by_node: dict[str, int] = {}
    communities = nx.community.greedy_modularity_communities(sub.to_undirected())
    for idx, members in enumerate(communities):
        for node in members:
            community_by_node[node] = idx
    return pagerank_by_node, community_by_node


@router.get("/stats", response_model=GraphStatsResponse)
def get_stats(graph: Annotated[LegalGraph, Depends(get_graph)]) -> GraphStatsResponse:
    """Return high-level statistics about the knowledge graph."""
    g = graph.graph
    return GraphStatsResponse(
        node_count=graph.node_count(),
        edge_count=graph.edge_count(),
        density=round(nx.density(g), 6),
        weakly_connected_components=nx.number_weakly_connected_components(g),
    )


@router.get("/top", response_model=GraphTopResponse)
def get_top(
    graph: Annotated[LegalGraph, Depends(get_graph)],
    limit: int = Query(10, ge=1, le=100),
) -> GraphTopResponse:
    """Return the top-`limit` most referenced laws by PageRank.

    Sprint 6 api-7 / rf-7: the `metric` query param used to exist but
    accepted only `pagerank` (single-value regex), and the handler
    discarded it with `del metric`. Dropped here until a second metric
    earns its place; the next ranking algorithm should re-introduce the
    param with a real `Literal["pagerank","betweenness",...]` shape.
    """
    items = top_laws(graph, n=limit)
    g = graph.graph
    rows = [
        GraphTopItem(law_id=law_id, score=round(score, PAGERANK_DECIMALS), title=g.nodes[law_id].get("title"))
        for law_id, score in items
    ]
    return GraphTopResponse(items=rows)
