"""Tests for build-time graph analytics (PageRank + communities, #25)."""

from __future__ import annotations

from pathlib import Path

from lexflow.core.delta_sync import CorpusDiff
from lexflow.core.enums import LawRank, LawStatus
from lexflow.core.models import Law, LawMetadata, Reference
from lexflow.core.registry import LawRegistry
from lexflow.graph.algorithms import enrich_graph_analytics, pagerank, top_laws
from lexflow.graph.builder import apply_diff_to_graph, build_graph
from lexflow.graph.cache import CACHE_VERSION, load_graph, save_graph
from lexflow.graph.model import LegalGraph


class FakeRegistry:
    """Minimal registry: each law is (title, [target_ids it references])."""

    def __init__(self, laws: dict[str, tuple[str, list[str]]]) -> None:
        self._laws = laws

    @property
    def law_ids(self) -> list[str]:
        return sorted(self._laws)

    def get_metadata(self, law_id: str) -> LawMetadata:
        title, _ = self._laws[law_id]
        return LawMetadata(identifier=law_id, title=title, rank=LawRank.LEY, status=LawStatus.IN_FORCE)

    def get_law(self, law_id: str) -> Law:
        _title, refs = self._laws[law_id]
        references = [Reference(target_id=t, target_text=t, source_article=None) for t in refs]
        return Law(metadata=self.get_metadata(law_id), file_path=f"{law_id}.md", references=references)


def test_enrich_sets_pagerank_and_community_on_every_node() -> None:
    graph = LegalGraph()
    graph.add_law(LawMetadata(identifier="A", title="Ley A", rank=LawRank.LEY, status=LawStatus.IN_FORCE))
    graph.add_law(LawMetadata(identifier="B", title="Ley B", rank=LawRank.LEY, status=LawStatus.IN_FORCE))
    graph.add_reference("A", "B")
    enrich_graph_analytics(graph)
    for nid in ("A", "B"):
        attrs = graph.graph.nodes[nid]
        assert isinstance(attrs["pagerank"], float)
        assert attrs["pagerank"] >= 0.0
        assert isinstance(attrs["community"], int)


def test_enrich_empty_graph_is_noop() -> None:
    graph = LegalGraph()
    enrich_graph_analytics(graph)
    assert graph.node_count() == 0


def test_build_graph_persists_analytics(sample_law_dir: Path) -> None:
    registry = LawRegistry(sample_law_dir)
    registry.preload_all_metadata()
    graph = build_graph(registry)
    assert graph.node_count() > 0
    for _, attrs in graph.graph.nodes(data=True):
        assert "pagerank" in attrs
        assert "community" in attrs


def test_top_laws_reads_persisted_attrs() -> None:
    graph = LegalGraph()
    graph.add_law(LawMetadata(identifier="LOW", title="Low", rank=LawRank.LEY, status=LawStatus.IN_FORCE))
    graph.add_law(LawMetadata(identifier="HIGH", title="High", rank=LawRank.LEY, status=LawStatus.IN_FORCE))
    graph.graph.nodes["LOW"]["pagerank"] = 0.1
    graph.graph.nodes["HIGH"]["pagerank"] = 0.9
    top = top_laws(graph, n=1)
    assert top == [("HIGH", 0.9)]


def test_top_laws_falls_back_when_attrs_missing() -> None:
    graph = LegalGraph()
    graph.add_law(LawMetadata(identifier="A", title="A", rank=LawRank.LEY, status=LawStatus.IN_FORCE))
    graph.add_law(LawMetadata(identifier="B", title="B", rank=LawRank.LEY, status=LawStatus.IN_FORCE))
    graph.add_reference("A", "B")
    computed = pagerank(graph)
    top = top_laws(graph, n=2)
    assert {nid for nid, _ in top} == set(computed)


def test_analytics_survive_cache_roundtrip(tmp_path: Path, sample_law_dir: Path) -> None:
    registry = LawRegistry(sample_law_dir)
    registry.preload_all_metadata()
    graph = build_graph(registry)
    cache_path = tmp_path / "graph_cache.json"
    save_graph(graph, cache_path, "rev-test")
    loaded = load_graph(cache_path)
    assert loaded is not None
    restored, cached_hash = loaded
    assert cached_hash == "rev-test"
    assert CACHE_VERSION == "5"
    for nid in graph.graph.nodes:
        assert restored.graph.nodes[nid]["pagerank"] == graph.graph.nodes[nid]["pagerank"]
        assert restored.graph.nodes[nid]["community"] == graph.graph.nodes[nid]["community"]


def test_apply_diff_refreshes_analytics() -> None:
    reg = FakeRegistry({"A": ("Ley A", ["B"]), "B": ("Ley B", [])})
    graph = build_graph(reg)  # type: ignore[arg-type]
    assert "pagerank" in graph.graph.nodes["A"]
    reg._laws["C"] = ("Ley C", ["A"])
    apply_diff_to_graph(graph, reg, CorpusDiff(added=["C"], modified=[], removed=[]))  # type: ignore[arg-type]
    assert "pagerank" in graph.graph.nodes["C"]
    assert "community" in graph.graph.nodes["C"]
    for _, attrs in graph.graph.nodes(data=True):
        assert "pagerank" in attrs
        assert "community" in attrs
