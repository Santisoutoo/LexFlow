"""In-memory full-text search engine.

Provides token-based, accent-insensitive search across all laws and articles.
Designed for Phase 1; Phase 7 will introduce semantic search with embeddings.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Callable
from dataclasses import dataclass, field

from lexflow.core.schemas import MatchRange, SearchResponse, SearchResult

# Strip leading/trailing punctuation per token; keep inner punctuation (LO, 1/2004).
_TOKEN_EDGE_PUNCT = ".,;:!?\"'()[]"


@dataclass(frozen=True)
class SearchEntry:
    """A single searchable unit — either a full law or a single article."""

    law_id: str
    law_title: str
    article_number: str | None
    text: str
    text_lower: str  # Pre-lowered for fast matching
    text_folded: str  # Accent-folded + lowercased for token matching
    law_title_lower: str
    law_title_folded: str


@dataclass
class SearchIndex:
    """Inverted index for full-text search across laws and articles."""

    _entries: list[SearchEntry] = field(default_factory=list)
    _built: bool = False

    @property
    def is_built(self) -> bool:
        """Whether the index has been populated."""
        return self._built

    @property
    def entry_count(self) -> int:
        """Total number of searchable entries."""
        return len(self._entries)

    def add_entry(
        self,
        law_id: str,
        law_title: str,
        article_number: str | None,
        text: str,
    ) -> None:
        """Add a single searchable entry to the index."""
        self._entries.append(
            SearchEntry(
                law_id=law_id,
                law_title=law_title,
                article_number=article_number,
                text=text,
                text_lower=text.lower(),
                text_folded=fold_for_search(text),
                law_title_lower=law_title.lower(),
                law_title_folded=fold_for_search(law_title),
            )
        )

    def mark_built(self) -> None:
        """Signal that index construction is complete."""
        self._built = True

    def remove_entries_for_law(self, law_id: str) -> None:
        """Drop every entry belonging to *law_id* (incremental delta, #230).

        Used before re-adding a modified law's entries, or on its own when a
        law is removed from the corpus. No-op if the law has no entries.
        """
        self._entries = [entry for entry in self._entries if entry.law_id != law_id]

    def to_dict(self) -> dict[str, list[dict[str, str | None]]]:
        """Serialize entries for disk caching (see core/search_cache.py).

        Derived fold/lowercase fields are intentionally dropped — they're pure
        derived data. :meth:`from_dict` recomputes them via :meth:`add_entry`.
        """
        return {
            "entries": [
                {
                    "law_id": entry.law_id,
                    "law_title": entry.law_title,
                    "article_number": entry.article_number,
                    "text": entry.text,
                }
                for entry in self._entries
            ]
        }

    @classmethod
    def from_dict(cls, data: dict[str, list[dict[str, str | None]]]) -> SearchIndex:
        """Rebuild an index from :meth:`to_dict` output, marked as built."""
        index = cls()
        for raw in data["entries"]:
            index.add_entry(
                law_id=raw["law_id"] or "",
                law_title=raw["law_title"] or "",
                article_number=raw["article_number"],
                text=raw["text"] or "",
            )
        index.mark_built()
        return index

    def search(
        self,
        query: str,
        *,
        page: int = 1,
        page_size: int = 20,
        law_filter: Callable[[str], bool] | None = None,
    ) -> SearchResponse:
        """Search for *query* across all indexed entries.

        Tokenizes the query and requires every token to appear in the entry
        body (AND semantics). Matching is accent-insensitive. Results are
        sorted by relevance (title matches score higher).

        ``law_filter`` (#671) keeps only hits whose ``law_id`` satisfies the
        predicate — applied AFTER ranking but BEFORE pagination so facet-filtered
        search keeps correct totals and page boundaries.
        """
        search_tokens = prepare_search_tokens(query)
        scored: list[tuple[float, SearchEntry]] = []

        for entry in self._entries:
            score = _score_entry(entry, search_tokens)
            if score > 0:
                scored.append((score, entry))

        scored.sort(key=lambda x: x[0], reverse=True)

        if law_filter is not None:
            scored = [(score, entry) for score, entry in scored if law_filter(entry.law_id)]

        total = len(scored)
        start = (page - 1) * page_size
        end = start + page_size
        page_items = scored[start:end]

        results = [_build_result(entry, search_tokens, score) for score, entry in page_items]

        return SearchResponse(
            query=query,
            total=total,
            items=results,
            page=page,
            page_size=page_size,
        )


# ---------------------------------------------------------------------------
# Matching helpers
# ---------------------------------------------------------------------------


def fold_for_search(text: str) -> str:
    """Lowercase, accent-fold, and collapse whitespace for matching only."""
    folded = unicodedata.normalize("NFKD", text.lower())
    without_accents = "".join(c for c in folded if not unicodedata.combining(c))
    return " ".join(without_accents.split())


def tokenize_query(query: str) -> list[str]:
    """Split *query* on whitespace; strip edge punctuation per token."""
    tokens: list[str] = []
    for raw in query.split():
        token = raw.strip(_TOKEN_EDGE_PUNCT)
        if token:
            tokens.append(token)
    return tokens


def prepare_search_tokens(query: str) -> list[str]:
    """Tokenize and fold *query* for scoring and highlighting."""
    return [fold_for_search(token) for token in tokenize_query(query) if fold_for_search(token)]


def find_folded(haystack: str, needle: str) -> tuple[int, int] | None:
    """Locate the first occurrence of *needle* in *haystack* using folded comparison.

    Returns character offsets into the original *haystack*, or ``None``.
    """
    needle_folded = fold_for_search(needle)
    if not needle_folded or not haystack:
        return None

    hay_len = len(haystack)
    for start in range(hay_len):
        match = _match_folded_at(haystack, start, needle_folded)
        if match is not None:
            return match
    return None


def find_all_folded(haystack: str, tokens: list[str]) -> list[tuple[int, int]]:
    """Return one range per token that appears in *haystack* (merged overlaps)."""
    ranges: list[tuple[int, int]] = []
    for token in tokens:
        found = find_folded(haystack, token)
        if found is not None:
            ranges.append(found)
    return _merge_ranges(ranges)


def _fold_char_at(text: str, index: int) -> tuple[str, int] | None:
    """Return the next folded character at *index* and the next index to read."""
    if index >= len(text):
        return None
    nfkd = unicodedata.normalize("NFKD", text[index].lower())
    visible = [c for c in nfkd if not unicodedata.combining(c)]
    if not visible:
        return None
    if all(c.isspace() for c in visible):
        return " ", index + 1
    return visible[0], index + 1


def _match_folded_at(haystack: str, start: int, needle_folded: str) -> tuple[int, int] | None:
    """Try to match *needle_folded* starting at *start* in *haystack*."""
    pos = start
    needle_pos = 0
    orig_start: int | None = None
    orig_end = start
    hay_len = len(haystack)

    while needle_pos < len(needle_folded):
        if needle_folded[needle_pos] == " ":
            if not _consume_folded_space(haystack, pos, hay_len):
                return None
            while pos < hay_len:
                folded = _fold_char_at(haystack, pos)
                if folded is None:
                    pos += 1
                    continue
                char, next_pos = folded
                if char == " ":
                    pos = next_pos
                else:
                    break
            needle_pos += 1
            continue

        while pos < hay_len:
            folded = _fold_char_at(haystack, pos)
            if folded is None:
                pos += 1
                continue
            char, next_pos = folded
            if char == " ":
                pos = next_pos
                continue
            if char != needle_folded[needle_pos]:
                return None
            if orig_start is None:
                orig_start = pos
            orig_end = next_pos
            pos = next_pos
            needle_pos += 1
            break
        else:
            return None

    if orig_start is None:
        return None
    return orig_start, orig_end


def _consume_folded_space(haystack: str, pos: int, hay_len: int) -> bool:
    """Return whether at least one whitespace character exists from *pos*."""
    scan = pos
    while scan < hay_len:
        folded = _fold_char_at(haystack, scan)
        if folded is None:
            scan += 1
            continue
        char, _next_pos = folded
        return char == " "
    return False


def _merge_ranges(ranges: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """Merge overlapping or adjacent highlight ranges."""
    if not ranges:
        return []
    sorted_ranges = sorted(ranges)
    merged: list[tuple[int, int]] = [sorted_ranges[0]]
    for start, end in sorted_ranges[1:]:
        prev_start, prev_end = merged[-1]
        if start <= prev_end:
            merged[-1] = (prev_start, max(prev_end, end))
        else:
            merged.append((start, end))
    return merged


# ---------------------------------------------------------------------------
# Scoring helpers
# ---------------------------------------------------------------------------

_TITLE_BOOST = 3.0
_MAX_TOKEN_COUNT = 5
# Required for AND matching but must not dominate scoring (#47).
_SCORE_STOPWORDS = frozenset(
    {"de", "la", "el", "los", "las", "y", "en", "del", "al", "a", "un", "una", "por", "con", "que"}
)


def _score_entry(entry: SearchEntry, search_tokens: list[str]) -> float:
    """Calculate relevance for *entry* against folded *search_tokens*.

    Every token must appear in the entry body (AND semantics). Score is the
    sum of per-token occurrence counts. When all tokens also appear in the
    law title, the score is multiplied by ``_TITLE_BOOST``.
    """
    if not search_tokens:
        return 0.0

    score = 0.0
    for token in search_tokens:
        count = entry.text_folded.count(token)
        if count == 0:
            return 0.0
        if token not in _SCORE_STOPWORDS:
            score += float(min(count, _MAX_TOKEN_COUNT))

    if score == 0.0:
        score = 1.0

    significant = [token for token in search_tokens if token not in _SCORE_STOPWORDS]
    if significant and all(token in entry.law_title_folded for token in significant):
        score *= _TITLE_BOOST

    return score


def _build_result(entry: SearchEntry, search_tokens: list[str], score: float) -> SearchResult:
    """Assemble a :class:`SearchResult` for one scored entry."""
    anchor = search_tokens[0] if search_tokens else ""
    snippet = _extract_snippet(entry.text, anchor)
    raw_ranges = find_all_folded(snippet, search_tokens)
    match_ranges = [MatchRange(start=start, end=end) for start, end in raw_ranges]
    match_start = match_ranges[0].start if match_ranges else None
    match_end = match_ranges[0].end if match_ranges else None
    return SearchResult(
        law_id=entry.law_id,
        law_title=entry.law_title,
        article_number=entry.article_number,
        snippet=snippet,
        match_start=match_start,
        match_end=match_end,
        match_ranges=match_ranges,
        score=score,
    )


def _extract_snippet(text: str, anchor: str, context_chars: int = 150) -> str:
    """Extract a text snippet around the first occurrence of *anchor*."""
    if not anchor:
        return text[: context_chars * 2] if text else ""

    match = find_folded(text, anchor)
    if match is None:
        return text[: context_chars * 2] if text else ""

    idx, end_idx = match
    anchor_len = end_idx - idx
    start = max(0, idx - context_chars)
    end = min(len(text), idx + anchor_len + context_chars)
    snippet = text[start:end].strip()

    if start > 0:
        snippet = "..." + snippet.lstrip()
        space = snippet.find(" ", 4)
        if space != -1:
            snippet = "..." + snippet[space + 1 :]

    if end < len(text):
        last_space = snippet.rfind(" ")
        snippet = snippet[:last_space] + "..." if last_space > len(snippet) - 20 else snippet + "..."

    snippet = re.sub(r"\s+", " ", snippet)
    return snippet


def _locate_match(snippet: str, query: str) -> tuple[int, int] | None:
    """Find the first folded occurrence of *query* in *snippet* (legacy helper)."""
    tokens = prepare_search_tokens(query)
    if not tokens:
        return None
    ranges = find_all_folded(snippet, tokens)
    return ranges[0] if ranges else None
