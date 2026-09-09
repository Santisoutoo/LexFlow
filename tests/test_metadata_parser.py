"""Tests for the fast metadata-only parser."""

from __future__ import annotations

from pathlib import Path

import pytest

from lexflow.core.metadata_parser import parse_metadata_only, read_frontmatter_block
from lexflow.core.parser import parse_law_file

CORPUS_PATH = Path(__file__).resolve().parent.parent / "data" / "legalize-es"
BOE_A_1968_1060 = CORPUS_PATH / "es" / "BOE-A-1968-1060.md"


def _corpus_file_or_skip(path: Path) -> Path:
    if not path.is_file():
        pytest.skip("legalize-es corpus not checked out")
    return path


def test_parse_metadata_only_reads_oversized_frontmatter() -> None:
    """Regression (#111): long references_* fields exceed the old 4 KB cap."""
    law_path = _corpus_file_or_skip(BOE_A_1968_1060)

    metadata = parse_metadata_only(law_path)
    full = parse_law_file(law_path)

    assert metadata.identifier == "BOE-A-1968-1060"
    assert metadata.identifier == full.metadata.identifier


def test_read_frontmatter_unterminated_returns_yaml(tmp_path: Path) -> None:
    """Regression (#44 R9): EOF without closing ``---`` still yields YAML."""
    law_path = tmp_path / "BOE-A-2099-9.md"
    subjects = "\n".join(f'  - "subject-{i}"' for i in range(200))
    law_path.write_text(f"---\ntitle: Unterminated\nsubjects:\n{subjects}\n", encoding="utf-8")

    raw = read_frontmatter_block(law_path)
    assert "subject-199" in raw
    assert raw.strip()


def test_parse_metadata_only_falls_back_to_path_stem(tmp_path: Path) -> None:
    """Missing ``identifier`` in frontmatter falls back to the filename stem (#44 R9)."""
    law_path = tmp_path / "es" / "BOE-A-2099-10.md"
    law_path.parent.mkdir(parents=True)
    law_path.write_text('---\ntitle: "No identifier field"\n---\n# Body\n', encoding="utf-8")

    metadata = parse_metadata_only(law_path)
    assert metadata.identifier == "BOE-A-2099-10"
