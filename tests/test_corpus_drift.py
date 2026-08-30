"""Tests for the corpus drift report (#55 Sprint 4)."""

from __future__ import annotations

from pathlib import Path

from lexflow.core.corpus_drift import compute_drift_report
from lexflow.core.registry import LawRegistry


class TestComputeDriftReport:
    def test_clean_corpus_reports_zero_drift(self, sample_law_dir: Path) -> None:
        registry = LawRegistry(sample_law_dir)
        report = compute_drift_report(registry)

        assert report.total_laws == 2
        assert report.unknown_status_count == 0
        assert report.empty_identifier_count == 0

    def test_unknown_status_value_is_counted(self, tmp_path: Path) -> None:
        law_path = tmp_path / "es" / "BOE-A-2099-1.md"
        law_path.parent.mkdir(parents=True, exist_ok=True)
        law_path.write_text(
            '---\nidentifier: "BOE-A-2099-1"\ntitle: "Test"\nstatus: "not_a_real_status"\n---\n# Test\n',
            encoding="utf-8",
        )
        registry = LawRegistry(tmp_path)
        report = compute_drift_report(registry)

        assert report.unknown_status_count == 1
        assert report.unknown_status_sample_ids == ["BOE-A-2099-1"]

    def test_zero_article_law_counted_only_when_already_parsed(self, tmp_path: Path) -> None:
        law_path = tmp_path / "es" / "BOE-A-2099-2.md"
        law_path.parent.mkdir(parents=True, exist_ok=True)
        law_path.write_text(
            '---\nidentifier: "BOE-A-2099-2"\ntitle: "Empty law"\n---\n# Empty law\n\nJust prose, no articles.\n',
            encoding="utf-8",
        )
        registry = LawRegistry(tmp_path)

        unparsed_report = compute_drift_report(registry)
        assert unparsed_report.zero_article_count == 0

        registry.get_law("BOE-A-2099-2")
        parsed_report = compute_drift_report(registry)
        assert parsed_report.zero_article_count == 1
        assert parsed_report.zero_article_sample_ids == ["BOE-A-2099-2"]

    def test_missing_identifier_is_counted(self, tmp_path: Path) -> None:
        law_path = tmp_path / "es" / "BOE-A-2099-3.md"
        law_path.parent.mkdir(parents=True, exist_ok=True)
        law_path.write_text(
            '---\ntitle: "No identifier"\n---\n# No identifier\n',
            encoding="utf-8",
        )
        registry = LawRegistry(tmp_path)
        report = compute_drift_report(registry)

        assert report.empty_identifier_count == 1
        assert report.empty_identifier_sample_ids == ["BOE-A-2099-3"]
