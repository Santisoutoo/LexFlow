"""Per-law fault isolation in the law registry (#42 R1)."""

from __future__ import annotations

from pathlib import Path
from textwrap import dedent

import pytest
from fastapi.testclient import TestClient

from lexflow.api.app import app
from lexflow.api.dependencies import get_law_registry
from lexflow.api.warmup import reset_warmup_state
from lexflow.core.registry import LawRegistry
from tests.conftest import SAMPLE_FRONTMATTER, SAMPLE_LAW_BODY


def _write_law(path: Path, frontmatter: str, body: str = SAMPLE_LAW_BODY) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"---\n{frontmatter}---\n{body}", encoding="utf-8")


@pytest.fixture()
def mixed_corpus_dir(tmp_path: Path) -> Path:
    """One valid law plus one with invalid ``publication_date``."""
    _write_law(tmp_path / "es" / "BOE-A-2000-323.md", SAMPLE_FRONTMATTER)

    bad_frontmatter = dedent(SAMPLE_FRONTMATTER).replace(
        'publication_date: "2000-01-08"',
        'publication_date: "garbage"',
    )
    _write_law(tmp_path / "es" / "BOE-A-BAD-1.md", bad_frontmatter, "##### Articulo 1.\n\nTexto.")
    return tmp_path


class TestRegistryFaultTolerance:
    def test_preload_skips_malformed_law(self, mixed_corpus_dir: Path) -> None:
        registry = LawRegistry(mixed_corpus_dir)
        registry.preload_all_metadata()
        assert registry.skipped_laws == 1

    def test_list_laws_omits_malformed_law(self, mixed_corpus_dir: Path) -> None:
        registry = LawRegistry(mixed_corpus_dir)
        registry.preload_all_metadata()
        ids = {summary.identifier for summary in registry.list_laws(page_size=50).items}
        assert ids == {"BOE-A-2000-323"}

    def test_warmup_reports_skipped_laws(
        self,
        mixed_corpus_dir: Path,
        client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from pathlib import Path
        from types import SimpleNamespace

        from lexflow.api import warmup as warmup_mod
        from lexflow.core import metadata_cache as mc
        from lexflow.core import search_cache as sc

        registry = LawRegistry(mixed_corpus_dir)
        app.dependency_overrides[get_law_registry] = lambda: registry
        monkeypatch.setattr(warmup_mod, "get_law_registry", lambda: registry)
        monkeypatch.setattr(warmup_mod, "get_settings", lambda: SimpleNamespace(data_path=Path(mixed_corpus_dir)))
        monkeypatch.setattr(mc, "submodule_hash", lambda _p: "abc1234")
        monkeypatch.setattr(sc, "submodule_hash", lambda _p: "abc1234")
        monkeypatch.setattr(warmup_mod, "get_graph", lambda _registry: None)
        monkeypatch.setattr(warmup_mod, "compute_drift_report", lambda _registry: None)
        monkeypatch.setattr(warmup_mod, "ensure_semantic_index", lambda _registry: None)

        reset_warmup_state()

        import asyncio

        asyncio.run(warmup_mod._run_warmup())

        body = client.get("/api/v1/system/warmup").json()
        assert body["skipped_laws"] == 1
        assert body["metadata_ready"] is True
        assert body["search_ready"] is True
        assert body["ready"] is True

        app.dependency_overrides.clear()
