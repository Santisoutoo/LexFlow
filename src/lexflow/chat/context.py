"""Bounded chat context for provider calls.

Compaction applies at the history boundary only — persisted DB rows stay
full-fidelity for the UI and audit trail.
"""

from __future__ import annotations

import json
from typing import Any

from lexflow.chat.base import ChatMessage as ProviderMessage

MAX_HISTORY_MESSAGES = 20
MAX_TOOL_CONTENT_CHARS = 4000
MAX_SEARCH_ITEMS = 10


def _truncate_text(text: str, max_chars: int) -> str:
    """Trim *text* to *max_chars*, appending an ellipsis when truncated."""
    cleaned = text.strip()
    if len(cleaned) <= max_chars:
        return cleaned
    if max_chars <= 1:
        return "…"
    return cleaned[: max_chars - 1].rstrip() + "…"


def _compact_get_law_payload(data: dict[str, Any]) -> dict[str, Any]:
    """Replace full article bodies with number/title stubs for context."""
    compacted = dict(data)
    articles = compacted.get("articles")
    if isinstance(articles, list):
        stubs: list[dict[str, Any]] = []
        for item in articles:
            if not isinstance(item, dict):
                continue
            stub: dict[str, Any] = {}
            if "number" in item:
                stub["number"] = item["number"]
            if "title" in item:
                stub["title"] = item["title"]
            if stub:
                stubs.append(stub)
        compacted["articles"] = stubs
    return compacted


def _compact_search_payload(data: dict[str, Any]) -> dict[str, Any]:
    """Cap search hit lists so tool rows do not dominate context."""
    compacted = dict(data)
    items = compacted.get("items")
    if isinstance(items, list) and len(items) > MAX_SEARCH_ITEMS:
        compacted["items"] = items[:MAX_SEARCH_ITEMS]
        compacted["truncated"] = True
    return compacted


def _compact_parsed_tool_json(data: dict[str, Any], tool_name: str) -> dict[str, Any]:
    """Apply tool-specific compaction to a parsed JSON object."""
    if tool_name == "get_law":
        return _compact_get_law_payload(data)
    if tool_name.startswith("search_"):
        return _compact_search_payload(data)
    if tool_name == "get_article":
        text = data.get("text")
        if isinstance(text, str):
            compacted = dict(data)
            compacted["text"] = _truncate_text(text, MAX_TOOL_CONTENT_CHARS)
            return compacted
    return data


def compact_tool_content(content: str, *, tool_name: str) -> str:
    """Shrink one persisted tool message before it is sent to the provider."""
    if len(content) <= MAX_TOOL_CONTENT_CHARS and not tool_name.startswith(("get_law", "search_", "get_article")):
        return content
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        return _truncate_text(content, MAX_TOOL_CONTENT_CHARS)
    if not isinstance(parsed, dict):
        return _truncate_text(content, MAX_TOOL_CONTENT_CHARS)
    compacted = _compact_parsed_tool_json(parsed, tool_name)
    serialized = json.dumps(compacted, ensure_ascii=False, default=str)
    if len(serialized) <= MAX_TOOL_CONTENT_CHARS:
        return serialized
    return _truncate_text(serialized, MAX_TOOL_CONTENT_CHARS)


def bound_history(messages: list[ProviderMessage]) -> list[ProviderMessage]:
    """Keep the system prompt and the most recent turns within the cap."""
    if not messages:
        return messages
    if messages[0].role == "system":
        system = messages[0]
        rest = messages[1:]
        if len(rest) <= MAX_HISTORY_MESSAGES:
            return messages
        return [system, *rest[-MAX_HISTORY_MESSAGES:]]
    if len(messages) <= MAX_HISTORY_MESSAGES:
        return messages
    return messages[-MAX_HISTORY_MESSAGES:]
