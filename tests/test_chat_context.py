"""Tests for chat context bounding and tool compaction."""

from __future__ import annotations

import json

from lexflow.chat.base import ChatMessage as ProviderMessage
from lexflow.chat.context import (
    MAX_HISTORY_MESSAGES,
    MAX_TOOL_CONTENT_CHARS,
    bound_history,
    compact_tool_content,
)


def test_bound_history_keeps_system_and_caps_tail() -> None:
    system = ProviderMessage(role="system", content="sys")
    rest = [ProviderMessage(role="user", content=f"u{i}") for i in range(MAX_HISTORY_MESSAGES + 5)]
    bounded = bound_history([system, *rest])
    assert bounded[0].role == "system"
    assert bounded[0].content == "sys"
    assert len(bounded) == MAX_HISTORY_MESSAGES + 1
    assert bounded[-1].content == f"u{MAX_HISTORY_MESSAGES + 4}"


def test_compact_get_law_strips_article_bodies() -> None:
    payload = {
        "law_id": "BOE-A-2018-16673",
        "articles": [
            {"number": "1", "title": "Objeto", "text": "x" * 5000},
            {"number": "2", "title": "Ámbito", "text": "y" * 5000},
        ],
    }
    compacted = compact_tool_content(json.dumps(payload), tool_name="get_law")
    parsed = json.loads(compacted)
    assert parsed["articles"] == [{"number": "1", "title": "Objeto"}, {"number": "2", "title": "Ámbito"}]
    assert len(compacted) < MAX_TOOL_CONTENT_CHARS


def test_compact_tool_content_truncates_oversized_json() -> None:
    payload = {"blob": "z" * (MAX_TOOL_CONTENT_CHARS + 100)}
    compacted = compact_tool_content(json.dumps(payload), tool_name="other_tool")
    assert len(compacted) <= MAX_TOOL_CONTENT_CHARS
