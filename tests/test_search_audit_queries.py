"""Audit acceptance queries for search UX (#47)."""

from __future__ import annotations

from pathlib import Path

import pytest

from lexflow.core.registry import LawRegistry

CORPUS_PATH = Path(__file__).resolve().parent.parent / "data" / "legalize-es"
CONSTITUTION_ID = "BOE-A-1978-31229"
ET_LAW_ID = "BOE-A-2015-11430"
LOPDGDD_ID = "BOE-A-2018-16673"


def _corpus_or_skip() -> Path:
    if not (CORPUS_PATH / "es").is_dir():
        pytest.skip("legalize-es corpus not checked out")
    return CORPUS_PATH


@pytest.fixture(scope="module")
def real_registry() -> LawRegistry:
    registry = LawRegistry(_corpus_or_skip())
    # Article-body hits require the law parsed before the search index builds.
    registry.get_law(ET_LAW_ID)
    registry.get_law(LOPDGDD_ID)
    return registry


class TestSearchAuditQueries:
    def test_constitucion_espanola(self, real_registry: LawRegistry) -> None:
        result = real_registry.search_text("constitucion española", page_size=5)
        law_ids = [item.law_id for item in result.items]
        assert CONSTITUTION_ID in law_ids

    def test_espanola_constitucion(self, real_registry: LawRegistry) -> None:
        result = real_registry.search_text("española constitución", page_size=5)
        law_ids = [item.law_id for item in result.items]
        assert CONSTITUTION_ID in law_ids

    def test_despido_indemnizacion(self, real_registry: LawRegistry) -> None:
        result = real_registry.search_text("despido indemnización", page_size=5)
        law_ids = [item.law_id for item in result.items]
        assert ET_LAW_ID in law_ids

    def test_lopd_sanciones_alias_and_ranges(self, real_registry: LawRegistry) -> None:
        result = real_registry.search_text("LOPD sanciones", page_size=5)
        assert result.query == "LOPD sanciones"
        assert any(e.token.upper() == "LOPD" for e in result.alias_expansions)
        law_ids = [item.law_id for item in result.items]
        assert LOPDGDD_ID in law_ids
        multi_range_hit = next((item for item in result.items if len(item.match_ranges) >= 2), None)
        assert multi_range_hit is not None
