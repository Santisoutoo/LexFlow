"""Corpus data-fidelity drift report, computed during warm-up (#55 Sprint 4).

Before this module, every drift signal (unknown enum value, empty
identifier, a law with zero articles) was warn-and-continue: logged once
via ``logger.warning`` and never counted or surfaced anywhere an operator
could see it (``registry.py`` #409). That silence is why a status
misclassification or an empty-identifier regression could sit in the
corpus for a full sprint before anyone noticed. :func:`compute_drift_report`
gives ``GET /api/v1/system/warmup`` a single, cheap snapshot to surface
instead.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic import BaseModel, ConfigDict, Field

from lexflow.core.enums import LawStatus
from lexflow.core.metadata_parser import read_frontmatter_block
from lexflow.core.parser import parse_frontmatter

if TYPE_CHECKING:
    from lexflow.core.registry import LawRegistry

_MAX_SAMPLE_IDS = 10
_KNOWN_STATUS_VALUES = {member.value for member in LawStatus}


class CorpusDriftReport(BaseModel):
    """Snapshot of known data-fidelity drift signals across the corpus.

    ``*_sample_ids`` are capped at :data:`_MAX_SAMPLE_IDS` — enough for an
    operator to jump straight to an offending law without inflating the
    warm-up payload when a regression affects thousands of laws at once.
    """

    model_config = ConfigDict(frozen=True)

    total_laws: int = 0
    unknown_status_count: int = 0
    empty_identifier_count: int = 0
    zero_article_count: int = 0
    unknown_status_sample_ids: list[str] = Field(default_factory=list)
    empty_identifier_sample_ids: list[str] = Field(default_factory=list)
    zero_article_sample_ids: list[str] = Field(default_factory=list)


def compute_drift_report(registry: LawRegistry) -> CorpusDriftReport:
    """Scan the whole corpus for known drift signals and count them.

    ``unknown_status_count`` / ``empty_identifier_count`` re-read each
    law's raw frontmatter directly (cheap — frontmatter-only, same as
    :func:`~lexflow.core.metadata_parser.parse_metadata_only`) rather than
    trusting the already-coerced :class:`~lexflow.core.models.LawMetadata`,
    because the enum fallback in :func:`~lexflow.core.parser._safe_enum`
    already swallowed the raw unknown value by the time it reaches
    ``LawMetadata``. ``zero_article_count`` instead reads
    ``registry.get_law(...).article_count`` from laws already in the
    registry's cache (the graph warm-up stage fully parses the whole
    corpus, so by the time this runs — after ``graph_ready`` — the cache
    is already complete and this step is a dict lookup, not a re-parse).
    """
    unknown_status_ids: list[str] = []
    empty_identifier_ids: list[str] = []
    zero_article_ids: list[str] = []

    law_ids = registry.law_ids
    for law_id in law_ids:
        if _has_unknown_status(registry, law_id):
            unknown_status_ids.append(law_id)
        if not registry.get_metadata(law_id).identifier:
            empty_identifier_ids.append(law_id)
        if registry.is_parsed(law_id) and registry.get_law(law_id).article_count == 0:
            zero_article_ids.append(law_id)

    return CorpusDriftReport(
        total_laws=len(law_ids),
        unknown_status_count=len(unknown_status_ids),
        empty_identifier_count=len(empty_identifier_ids),
        zero_article_count=len(zero_article_ids),
        unknown_status_sample_ids=unknown_status_ids[:_MAX_SAMPLE_IDS],
        empty_identifier_sample_ids=empty_identifier_ids[:_MAX_SAMPLE_IDS],
        zero_article_sample_ids=zero_article_ids[:_MAX_SAMPLE_IDS],
    )


def _has_unknown_status(registry: LawRegistry, law_id: str) -> bool:
    """Whether *law_id*'s raw ``status`` frontmatter value is non-null and unknown."""
    path = registry.law_file_path(law_id)
    if path is None:
        return False
    raw_status = parse_frontmatter(read_frontmatter_block(path)).get("status")
    return raw_status is not None and raw_status not in _KNOWN_STATUS_VALUES
