"""Graph algorithms: PageRank, community detection, shortest path."""

from __future__ import annotations

from typing import cast

import networkx as nx

from lexflow.graph.model import LegalGraph

PAGERANK_DECIMALS = 6


def pagerank(graph: LegalGraph, alpha: float = 0.85) -> dict[str, float]:
    """Compute PageRank scores for all law nodes."""
    if graph.node_count() == 0:
        return {}
    return cast(dict[str, float], nx.pagerank(graph.graph, alpha=alpha))


def _is_numeric_score(raw: object) -> bool:
    """True for int/float PageRank values; bool is excluded (it subclasses int)."""
    return isinstance(raw, (int, float)) and not isinstance(raw, bool)


def persisted_pagerank(graph: LegalGraph) -> dict[str, float] | None:
    """Return node ``pagerank`` attrs, or ``None`` if any node is missing them."""
    scores: dict[str, float] = {}
    for node_id, attrs in graph.graph.nodes(data=True):
        raw = attrs.get("pagerank")
        if not _is_numeric_score(raw):
            return None
        scores[node_id] = float(raw)
    return scores


def top_laws(graph: LegalGraph, n: int = 10) -> list[tuple[str, float]]:
    """Return top-n laws by PageRank score.

    Prefers scores persisted on nodes by :func:`enrich_graph_analytics` so
    request-time ranking is an O(N log N) sort, not a full ``nx.pagerank``.
    Falls back to computing PageRank when attrs are missing (pre-v5 cache).
    """
    scores = persisted_pagerank(graph)
    if scores is None:
        scores = pagerank(graph)
    return sorted(scores.items(), key=lambda x: x[1], reverse=True)[:n]


def shortest_path(graph: LegalGraph, source: str, target: str) -> list[str]:
    """Return shortest directed path between two laws. Raises nx.NetworkXNoPath if none."""
    return cast(list[str], nx.shortest_path(graph.graph, source=source, target=target))


def community_detection(graph: LegalGraph) -> dict[str, int]:
    """Assign community IDs to each law using greedy modularity."""
    if graph.node_count() == 0:
        return {}
    undirected = graph.graph.to_undirected()
    communities = nx.community.greedy_modularity_communities(undirected)
    result: dict[str, int] = {}
    for idx, community in enumerate(communities):
        for node in community:
            result[node] = idx
    return result


def enrich_graph_analytics(graph: LegalGraph) -> None:
    """Persist corpus-wide PageRank + community id on every node.

    Runs at graph build / incremental-sync time so request handlers can
    sort, size and colour from O(1) attribute lookups instead of
    recomputing ``nx.pagerank`` + ``greedy_modularity`` per call.
    PageRank is rounded to :data:`PAGERANK_DECIMALS` to match the
    historical wire format of the graph router.
    """
    if graph.node_count() == 0:
        return
    scores = pagerank(graph)
    communities = community_detection(graph)
    for node_id in graph.graph.nodes:
        graph.graph.nodes[node_id]["pagerank"] = round(scores.get(node_id, 0.0), PAGERANK_DECIMALS)
        graph.graph.nodes[node_id]["community"] = communities.get(node_id, 0)
