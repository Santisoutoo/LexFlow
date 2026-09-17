"""Cold-start performance regressions for issue #78."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor as RealThreadPoolExecutor
from pathlib import Path
from textwrap import dedent
from unittest.mock import patch

from lexflow.core.parser import (
    _load_yaml_dict,
    _scan_body,
    extract_law_body_structure,
    extract_law_references_from_content,
    parse_frontmatter,
)
from lexflow.core.registry import LawRegistry
from lexflow.graph.builder import build_graph


def test_load_yaml_dict_prefers_csafe_loader() -> None:
    calls: list[str] = []

    def fake_load(text: str, Loader: type) -> dict[str, str]:  # noqa: N803
        calls.append(Loader.__name__)
        return {"title": "Ley de prueba"}

    with (
        patch("lexflow.core.parser.yaml.load", side_effect=fake_load),
        patch("lexflow.core.parser.yaml.CSafeLoader", create=True) as csafe,
    ):
        csafe.__name__ = "CSafeLoader"
        result = _load_yaml_dict("title: Ley de prueba")

    assert result == {"title": "Ley de prueba"}
    assert calls == ["CSafeLoader"]


def test_parse_frontmatter_falls_back_to_safe_load() -> None:
    with patch("lexflow.core.parser.yaml.CSafeLoader", None):
        data = parse_frontmatter("rank: ley\n")
    assert data == {"rank": "ley"}


def test_extract_law_body_structure_scans_once() -> None:
    body = dedent("""\
        ## TITULO

        ###### Artículo 1

        Texto.
    """)
    scan_calls = 0
    original_scan = _scan_body

    def counting_scan(text: str):
        nonlocal scan_calls
        scan_calls += 1
        return original_scan(text)

    with patch("lexflow.core.parser._scan_body", side_effect=counting_scan):
        sections, articles = extract_law_body_structure(body)

    assert len(sections) == 1
    assert len(articles) == 1
    assert scan_calls == 1


def test_extract_law_references_from_content_collects_section_and_article_refs() -> None:
    content = dedent("""\
        ---
        title: Ley de prueba
        identifier: BOE-A-TEST
        ---
        ## PREÁMBULO

        Se cita la Ley 39/2015.

        ###### Artículo 1

        También la Ley 40/2015.
    """)
    refs = extract_law_references_from_content(content)
    texts = {ref.target_text for ref in refs}
    assert "Ley 39/2015" in texts
    assert "Ley 40/2015" in texts


def test_build_graph_does_not_populate_registry_cache(sample_law_dir: Path) -> None:
    registry = LawRegistry(sample_law_dir)
    registry.preload_all_metadata()
    assert not registry._cache

    build_graph(registry)

    assert not registry._cache


def test_preload_all_metadata_parallelizes(tmp_path: Path) -> None:
    law_dir = tmp_path / "es"
    law_dir.mkdir(parents=True)
    for idx in range(4):
        (law_dir / f"BOE-A-TEST-{idx}.md").write_text(
            dedent(f"""\
                ---
                title: Ley {idx}
                identifier: BOE-A-TEST-{idx}
                ---
                Cuerpo {idx}.
            """),
            encoding="utf-8",
        )

    registry = LawRegistry(tmp_path)
    with patch("lexflow.core.registry.ThreadPoolExecutor") as mock_executor:
        mock_executor.side_effect = lambda **kwargs: RealThreadPoolExecutor(**kwargs)
        registry.preload_all_metadata()
        mock_executor.assert_called_once()
        assert registry._metadata_cache
