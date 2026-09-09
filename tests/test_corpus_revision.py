"""Corpus revision fallback without git (#42 R4)."""

from __future__ import annotations

from pathlib import Path

import pytest

from lexflow.core import metadata_cache as mc
from lexflow.core.corpus_revision import (
    CORPUS_REVISION_FILENAME,
    UNKNOWN_REVISION,
    submodule_hash,
    write_corpus_revision,
)
from tests.test_metadata_cache import _FakeRegistry


def test_submodule_hash_reads_revision_file_when_git_missing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    data_path = tmp_path / "legalize-es"
    data_path.mkdir()
    revision_path = tmp_path / CORPUS_REVISION_FILENAME
    revision_path.write_text("abc1234\n", encoding="utf-8")

    monkeypatch.setattr("lexflow.core.corpus_revision._git_revision", lambda _p: None)

    assert submodule_hash(data_path) == "abc1234"


def test_write_corpus_revision_persists_git_head(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    data_path = tmp_path / "legalize-es"
    data_path.mkdir()
    monkeypatch.setattr("lexflow.core.corpus_revision._git_revision", lambda _p: "deadbeef")

    assert write_corpus_revision(data_path) == "deadbeef"
    assert (tmp_path / CORPUS_REVISION_FILENAME).read_text(encoding="utf-8").strip() == "deadbeef"


def test_revision_file_enables_metadata_cache_hit(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    data_path = tmp_path / "legalize-es"
    data_path.mkdir()
    (tmp_path / CORPUS_REVISION_FILENAME).write_text("abc1234\n", encoding="utf-8")
    monkeypatch.setattr(mc, "submodule_hash", lambda _p: submodule_hash(_p))

    first = _FakeRegistry()
    mc.load_or_preload_metadata(first, data_path)
    assert first.preload_calls == 1
    assert (tmp_path / mc.CACHE_FILENAME).exists()

    second = _FakeRegistry()
    mc.load_or_preload_metadata(second, data_path)
    assert second.preload_calls == 0


def test_unknown_revision_still_bypasses_cache(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mc, "submodule_hash", lambda _p: UNKNOWN_REVISION)
    data_path = tmp_path / "legalize-es"
    data_path.mkdir()

    registry = _FakeRegistry()
    mc.load_or_preload_metadata(registry, data_path)
    assert registry.preload_calls == 1
    assert not (tmp_path / mc.CACHE_FILENAME).exists()
