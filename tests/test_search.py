"""Tests for the in-memory search engine."""

from __future__ import annotations

from lexflow.core.search import SearchIndex, _extract_snippet, _locate_match, fold_for_search


class TestSearchIndex:
    def _build_index(self) -> SearchIndex:
        idx = SearchIndex()
        idx.add_entry(
            law_id="BOE-A-2000-323",
            law_title="Ley de Enjuiciamiento Civil",
            article_number=None,
            text="Ley de Enjuiciamiento Civil",
        )
        idx.add_entry(
            law_id="BOE-A-2000-323",
            law_title="Ley de Enjuiciamiento Civil",
            article_number="1",
            text="En los procesos civiles, los tribunales deberan actuar con arreglo a la ley.",
        )
        idx.add_entry(
            law_id="BOE-A-2018-16673",
            law_title="Ley Organica de Proteccion de Datos",
            article_number="1",
            text="La presente ley tiene por objeto garantizar los derechos digitales.",
        )
        idx.add_entry(
            law_id="BOE-A-1978-31229",
            law_title="Constitución Española",
            article_number=None,
            text="Constitución Española",
        )
        idx.add_entry(
            law_id="BOE-A-1978-31229",
            law_title="Constitución Española",
            article_number="1",
            text="España se constituye en un Estado social y democrático de Derecho.",
        )
        idx.add_entry(
            law_id="BOE-A-2015-11430",
            law_title="Real Decreto Legislativo 2/2015, Estatuto de los Trabajadores",
            article_number="56",
            text="El despido procedente no da derecho a indemnización.",
        )
        idx.mark_built()
        return idx

    def test_accent_fold_matches_unaccented_query(self) -> None:
        idx = self._build_index()
        result = idx.search("constitucion")
        assert result.total > 0
        assert any(r.law_id == "BOE-A-1978-31229" for r in result.items)

    def test_token_and_order_independent(self) -> None:
        idx = self._build_index()
        forward = idx.search("española constitucion")
        backward = idx.search("constitucion española")
        assert forward.total > 0
        assert backward.total > 0
        assert {r.law_id for r in forward.items} & {"BOE-A-1978-31229"}
        assert {r.law_id for r in backward.items} & {"BOE-A-1978-31229"}

    def test_multi_token_article_match(self) -> None:
        idx = self._build_index()
        result = idx.search("despido indemnización")
        assert result.total > 0
        assert any(r.law_id == "BOE-A-2015-11430" for r in result.items)

    def test_finds_matching_title(self) -> None:
        idx = self._build_index()
        result = idx.search("Enjuiciamiento")
        assert result.total > 0
        assert any(r.law_id == "BOE-A-2000-323" for r in result.items)

    def test_law_filter_restricts_hits_before_pagination(self) -> None:
        # "ley" matches entries across both laws; the facet filter (#671) keeps
        # only one law, and the total reflects the drop (filtered before paging).
        idx = self._build_index()
        unfiltered = idx.search("ley")
        assert {r.law_id for r in unfiltered.items} >= {"BOE-A-2000-323", "BOE-A-2018-16673"}

        filtered = idx.search("ley", law_filter=lambda lid: lid == "BOE-A-2018-16673")
        assert filtered.total >= 1
        assert filtered.total < unfiltered.total
        assert all(r.law_id == "BOE-A-2018-16673" for r in filtered.items)

    def test_finds_matching_article(self) -> None:
        idx = self._build_index()
        result = idx.search("procesos civiles")
        assert result.total > 0
        assert result.items[0].article_number == "1"

    def test_returns_empty_for_no_match(self) -> None:
        idx = self._build_index()
        result = idx.search("xyznonexistent")
        assert result.total == 0
        assert result.items == []

    def test_case_insensitive(self) -> None:
        idx = self._build_index()
        result = idx.search("ENJUICIAMIENTO")
        assert result.total > 0

    def test_title_boost_ranking(self) -> None:
        idx = self._build_index()
        # "Enjuiciamiento" appears in title and article text
        result = idx.search("Enjuiciamiento")
        # Title match should score higher
        assert result.items[0].article_number is None  # law-level entry

    def test_pagination(self) -> None:
        idx = self._build_index()
        result = idx.search("ley", page=1, page_size=1)
        assert len(result.items) == 1
        assert result.total > 1

    def test_snippet_has_context(self) -> None:
        idx = self._build_index()
        result = idx.search("tribunales")
        assert result.total > 0
        assert "tribunales" in result.items[0].snippet.lower()


class TestExtractSnippet:
    def test_basic(self) -> None:
        text = "En los procesos civiles, los tribunales deberan actuar con arreglo a la ley."
        snippet = _extract_snippet(text, "tribunales")
        assert "tribunales" in snippet.lower()

    def test_no_match_returns_start(self) -> None:
        text = "Some text without the query."
        snippet = _extract_snippet(text, "zzz")
        assert len(snippet) > 0


class TestLocateMatch:
    def test_returns_offsets_of_substring(self) -> None:
        offsets = _locate_match("alpha tribunales beta", "tribunales")
        assert offsets == (6, 16)

    def test_case_insensitive(self) -> None:
        offsets = _locate_match("alpha TRIBUNALES beta", "tribunales")
        assert offsets == (6, 16)

    def test_returns_none_when_query_absent(self) -> None:
        # Happens when the snippet was trimmed past the match or the hit was
        # title-only (the snippet is built from body text).
        assert _locate_match("alpha beta gamma", "zzz") is None

    def test_returns_none_on_empty_inputs(self) -> None:
        assert _locate_match("", "tribunales") is None
        assert _locate_match("alpha", "") is None


class TestSearchResultMatchOffsets:
    def _index(self) -> SearchIndex:
        idx = SearchIndex()
        idx.add_entry(
            law_id="BOE-A-2000-323",
            law_title="Ley de Enjuiciamiento Civil",
            article_number="1",
            text="En los procesos civiles, los tribunales deberan actuar con arreglo a la ley.",
        )
        idx.mark_built()
        return idx

    def test_offsets_locate_query_inside_snippet(self) -> None:
        result = self._index().search("tribunales")
        hit = result.items[0]
        assert hit.match_start is not None
        assert hit.match_end is not None
        assert hit.snippet[hit.match_start : hit.match_end].lower() == "tribunales"
        assert len(hit.match_ranges) >= 1

    def test_multi_token_match_ranges(self) -> None:
        idx = SearchIndex()
        idx.add_entry(
            law_id="BOE-A-2018-16673",
            law_title="Ley Orgánica de Protección de Datos",
            article_number="72",
            text="Las sanciones por infracciones graves en materia de protección de datos personales.",
        )
        idx.mark_built()
        result = idx.search("protección sanciones")
        hit = result.items[0]
        assert len(hit.match_ranges) >= 2

    def test_offsets_preserve_case_of_snippet(self) -> None:
        # The query is lowercase but the snippet keeps the original case —
        # the returned substring should equal what is *in the snippet*, not
        # the lowercased query.
        result = self._index().search("Tribunales")
        hit = result.items[0]
        assert hit.match_start is not None
        assert hit.match_end is not None
        assert hit.snippet[hit.match_start : hit.match_end] == "tribunales"


class TestFoldForSearch:
    def test_strips_accents(self) -> None:
        assert fold_for_search("Constitución") == "constitucion"
