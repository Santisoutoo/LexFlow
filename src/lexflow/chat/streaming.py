"""SSE streaming for chat replies (issue #84).

Implements the streaming substrate behind
``POST /api/v1/chat/threads/{id}/send``:

1. Resolve the model id (``"openai:gpt-4o"``) to a concrete
   :class:`ChatProvider`.
2. Build the full message history for the thread (DB + the new user
   turn) so the model has context.
3. Call ``provider.stream_chat()`` and forward each text chunk to the
   client as an SSE ``text`` event.
4. On stream completion, persist the assistant turn so the next request
   sees it.

The MCP tool-use loop (``tool_call`` and ``source`` events) lives in a
follow-up issue — the :class:`ChatProvider` interface doesn't expose
tool calls yet, so this PR only emits ``text``, ``error`` and ``done``
events. The wire format is forward-compatible: clients that already
handle ``tool_call`` / ``source`` will keep working once those land.

--- WHERE TO CHANGE IF X CHANGES ---
* New event type            → add a constant in :class:`SseEvent` and
                              a producer below.
* New provider key          → register it in :func:`_provider_for`.
* Persistence shape changes → ``lexflow.chat.storage_models`` and
                              ``lexflow.chat.schemas``.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from functools import partial
from typing import Any

import anyio.to_thread
from sqlmodel import Session

from lexflow.chat import provider_registry
from lexflow.chat.base import ChatMessage as ProviderMessage
from lexflow.chat.base import (
    ChatProvider,
    ChatProviderError,
    FinishChunk,
    TextChunk,
    ToolCallChunk,
    ToolCallRef,
    ToolSpec,
)
from lexflow.chat.context import bound_history, compact_tool_content
from lexflow.chat.mcp_server import TOOL_SPECS, dispatch_tool
from lexflow.chat.prompts import build_system_prompt
from lexflow.chat.storage_models import DEFAULT_THREAD_TITLE, ChatMessage, ChatThread
from lexflow.core.exceptions import LawNotFoundError
from lexflow.core.registry import get_registry

# Hard cap on the agentic loop (#195). Once hit, we stop iterating even
# if the model keeps asking for more tool calls — runaway loops would
# pin the server + burn cloud quota.
_MAX_TOOL_ITERATIONS = 5

logger = logging.getLogger(__name__)


class SseEvent:
    """Canonical SSE event names emitted by this module.

    Centralised so the React client and the backend agree on the wire
    vocabulary. Adding a new event here is the right place to start
    (tool_call / source live here pending the MCP loop).
    """

    TEXT = "text"
    TOOL_CALL = "tool_call"
    SOURCE = "source"
    DEGRADED = "degraded"
    ERROR = "error"
    DONE = "done"


class UnknownProviderError(ValueError):
    """Raised when the ``provider:model`` id has an unknown provider key."""


def _classify_provider_error(exc: ChatProviderError) -> tuple[str, str]:
    """Map a provider failure to ``(code, safe_message)`` for SSE + persistence."""
    msg = str(exc).lower()

    if "ollama" in msg:
        if any(
            token in msg for token in ("connection refused", "connect", "errno", "unreachable", "failed to connect")
        ):
            return ("ollama_not_running", "Ollama is not running or unreachable.")
        return ("ollama_error", "Ollama reported an error. Check that the model is pulled and the daemon is running.")

    if "lm studio" in msg:
        return ("lmstudio_unreachable", "LM Studio is not reachable. Check that the server is running.")

    if "openai authentication" in msg:
        return ("openai_auth_failed", "OpenAI authentication failed. Check your API key in Settings.")

    if "openai rate limit" in msg:
        return ("openai_rate_limited", "OpenAI rate limit exceeded. Wait a moment and try again.")

    if "anthropic authentication" in msg:
        return ("anthropic_auth_failed", "Anthropic authentication failed. Check your API key in Settings.")

    if "anthropic rate limit" in msg:
        return ("anthropic_rate_limited", "Anthropic rate limit exceeded. Wait a moment and try again.")

    if "google gemini" in msg:
        return ("google_error", "Google Gemini error. Check your API key and try again.")

    return ("provider_error", "The AI provider failed. Try again or choose another model.")


def _sse_error_payload(*, detail: str, code: str) -> dict[str, str]:
    """Build the canonical SSE error object (``detail`` + ``code``)."""
    return {"detail": detail, "code": code}


def split_model_id(model_id: str) -> tuple[str, str]:
    """Split ``"openai:gpt-4o"`` → ``("openai", "gpt-4o")``.

    Raises :class:`UnknownProviderError` for malformed input. Model
    names themselves may contain colons (e.g. ``"llama3.1:8b"``), so we
    only split on the first one.
    """
    if ":" not in model_id:
        raise UnknownProviderError(f"Model id must be 'provider:model', got: {model_id!r}")
    provider_key, _, model_name = model_id.partition(":")
    if not provider_key or not model_name:
        raise UnknownProviderError(f"Model id must be 'provider:model', got: {model_id!r}")
    return provider_key, model_name


def _provider_for(provider_key: str) -> ChatProvider:
    """Instantiate the chat provider matching ``provider_key``.

    Reads from the shared registry through a module attribute so tests
    that monkeypatch ``provider_registry.PROVIDERS_BY_KEY`` reach this
    layer without a separate patch site.
    """
    spec = provider_registry.PROVIDERS_BY_KEY.get(provider_key)
    if spec is None:
        raise UnknownProviderError(f"Unknown chat provider: {provider_key!r}")
    return spec.factory()


def format_sse(event: str, data: Any) -> str:
    """Render one SSE event as a wire-format string.

    ``data`` is JSON-encoded. Multi-line payloads would be a parse hazard
    on the client side, so we always emit a single ``data:`` line —
    EventSource handles single-line JSON cleanly.
    """
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event}\ndata: {payload}\n\n"


_SNIPPET_MAX_LEN = 220


def _truncate_snippet(text: str) -> str:
    """Trim article text to a card-friendly snippet."""
    cleaned = text.strip()
    if len(cleaned) <= _SNIPPET_MAX_LEN:
        return cleaned
    return cleaned[:_SNIPPET_MAX_LEN].rstrip() + "…"


def _law_title_from_registry(law_id: str) -> str | None:
    """Resolve a display title for *law_id*, or ``None`` when missing."""
    try:
        return get_registry().get_law(law_id).metadata.title
    except LawNotFoundError:
        return None


def _publication_date_from_registry(law_id: str) -> str | None:
    """Resolve an ISO publication date for *law_id*, or ``None``."""
    try:
        published = get_registry().get_law(law_id).metadata.publication_date
    except LawNotFoundError:
        return None
    return str(published) if published is not None else None


def _enrich_citation(citation: dict[str, Any]) -> dict[str, Any]:
    """Fill missing title/date from the registry when a tool omitted them."""
    law_id = citation.get("law_id")
    if not isinstance(law_id, str) or not law_id:
        return citation
    if "law_title" not in citation:
        title = _law_title_from_registry(law_id)
        if title:
            citation["law_title"] = title
    if "publication_date" not in citation:
        published = _publication_date_from_registry(law_id)
        if published:
            citation["publication_date"] = published
    return citation


def _extract_citations(
    result: dict[str, Any],
    *,
    tool_name: str,
    tool_args: dict[str, Any],
) -> list[dict[str, Any]]:
    """Pull enriched law/article citations out of an MCP tool result (#195, #39).

    Emits ``law_id`` (always when present), optional ``article_number``,
    ``law_title``, ``snippet``, and ``publication_date`` for the frontend
    citation cards. Error payloads and ``get_stats`` emit nothing.
    """
    if not isinstance(result, dict) or result.get("error"):
        return []

    citations: list[dict[str, Any]] = []

    if tool_name in {"search_law", "search_semantic_top_k"}:
        items = result.get("items")
        if isinstance(items, list):
            for hit in items:
                if not isinstance(hit, dict):
                    continue
                law_id = hit.get("law_id")
                if not isinstance(law_id, str) or not law_id:
                    continue
                citation: dict[str, Any] = {"law_id": law_id}
                law_title = hit.get("law_title")
                if isinstance(law_title, str) and law_title:
                    citation["law_title"] = law_title
                article = hit.get("article_number")
                if isinstance(article, str) and article:
                    citation["article_number"] = article
                snippet = hit.get("snippet")
                if isinstance(snippet, str) and snippet:
                    citation["snippet"] = snippet
                citations.append(_enrich_citation(citation))
        return citations

    if tool_name == "get_law":
        metadata = result.get("metadata")
        if isinstance(metadata, dict):
            identifier = metadata.get("identifier")
            if isinstance(identifier, str) and identifier:
                law_citation: dict[str, Any] = {"law_id": identifier}
                title = metadata.get("title")
                if isinstance(title, str) and title:
                    law_citation["law_title"] = title
                published = metadata.get("publication_date")
                if published:
                    law_citation["publication_date"] = str(published)
                citations.append(_enrich_citation(law_citation))
        return citations

    if tool_name == "get_article":
        number = result.get("number")
        law_id = tool_args.get("law_id")
        if isinstance(number, str) and number and isinstance(law_id, str) and law_id:
            article_citation: dict[str, Any] = {"law_id": law_id, "article_number": number}
            text = result.get("text")
            if isinstance(text, str) and text:
                article_citation["snippet"] = _truncate_snippet(text)
            citations.append(_enrich_citation(article_citation))

    return citations


def _persist_user_turn(session: Session, thread: ChatThread, content: str) -> None:
    """Save the user turn before any streaming starts.

    Persisting first means a stream crash never swallows the user's
    question. We commit but deliberately do NOT bump ``thread.updated_at``
    yet — the assistant turn will, so the thread surfaces in the chat
    rail under the latest activity.
    """
    user_message = ChatMessage(
        thread_id=thread.id,
        role="user",
        content=content,
    )
    session.add(user_message)
    session.commit()


def _derive_title_from_message(text: str, *, max_len: int = 60) -> str:
    """Build a short thread title from the first user message."""
    collapsed = " ".join(text.split())
    if collapsed.endswith("?"):
        collapsed = collapsed[:-1].rstrip()
    if len(collapsed) <= max_len:
        return collapsed
    return collapsed[: max_len - 1].rstrip() + "…"


def _maybe_auto_title_thread(
    session: Session,
    thread: ChatThread,
    user_message_content: str,
) -> None:
    """Rename a default-titled thread after its first user turn."""
    session.refresh(thread)
    if thread.title != DEFAULT_THREAD_TITLE:
        return
    user_turns = sum(1 for message in thread.messages if message.role == "user")
    if user_turns != 1:
        return
    thread.title = _derive_title_from_message(user_message_content)
    thread.updated_at = datetime.now(UTC)
    session.add(thread)
    session.commit()


def _persist_assistant_turn(
    session: Session,
    thread: ChatThread,
    content: str,
    payload: dict[str, Any] | None = None,
    *,
    model_id: str | None = None,
) -> None:
    """Save the assistant turn and bump the thread's activity timestamp.

    Empty replies still get a row so the UI doesn't render a "ghost
    turn"; the empty content tells the rail "nothing to show here".
    Optional ``payload`` carries ``sources`` and/or intermediate
    ``tool_calls`` for refetch reconstruction.
    """
    merged: dict[str, Any] | None = None
    if payload is not None:
        merged = dict(payload)
    if model_id:
        if merged is None:
            merged = {"model": model_id}
        else:
            merged["model"] = model_id
    payload_json = json.dumps(merged, ensure_ascii=False) if merged is not None else None
    assistant_message = ChatMessage(
        thread_id=thread.id,
        role="assistant",
        content=content,
        payload_json=payload_json,
    )
    session.add(assistant_message)
    thread.updated_at = datetime.now(UTC)
    session.add(thread)
    session.commit()


def _persist_tool_turn(
    session: Session,
    thread: ChatThread,
    call: ToolCallChunk,
    result: dict[str, Any],
) -> None:
    """Persist one executed tool turn for refetch and history rebuild."""
    payload = {"name": call.name, "args": call.arguments, "call_id": call.call_id}
    tool_message = ChatMessage(
        thread_id=thread.id,
        role="tool",
        content=json.dumps(result, ensure_ascii=False, default=str),
        payload_json=json.dumps(payload, ensure_ascii=False),
    )
    session.add(tool_message)
    session.commit()


def _run_tool_call(call: ToolCallChunk) -> dict[str, Any]:
    """Dispatch one MCP tool call and wrap failures into a result payload.

    The agentic loop must keep flowing even when a tool blows up — the
    model can apologise / retry. ``KeyError`` from a missing tool maps
    to ``{"error": "unknown_tool", ...}``; any other exception to
    ``{"error": "tool_error", "detail": ...}``. The full stack trace is
    logged on the server, never surfaced to the client.
    """
    try:
        return dispatch_tool(call.name, call.arguments)
    except KeyError:
        return {"error": "unknown_tool", "name": call.name}
    except Exception as exc:
        # The agentic loop must absorb tool failures — a single buggy tool
        # shouldn't kill the user-facing stream. Log the full trace
        # server-side, surface a generic error result the model can
        # apologise / retry on.
        logger.exception("Tool %s failed during agentic loop", repr(call.name))
        return {"error": "tool_error", "detail": str(exc)}


def _record_assistant_tool_calls(
    history: list[ProviderMessage],
    calls: list[ToolCallChunk],
    *,
    content: str = "",
) -> None:
    """Append the assistant turn that requested *calls* before tool results."""
    history.append(
        ProviderMessage(
            role="assistant",
            content=content,
            tool_calls=[ToolCallRef(call_id=call.call_id, name=call.name, arguments=call.arguments) for call in calls],
        )
    )


def _record_tool_outcome(
    history: list[ProviderMessage],
    call: ToolCallChunk,
    result: dict[str, Any],
) -> None:
    """Append a ``tool`` message describing *call*'s outcome to *history*.

    The provider re-reads this on the next iteration of the agentic
    loop to decide whether it needs more tool calls or can answer.
    """
    history.append(
        ProviderMessage(
            role="tool",
            content=compact_tool_content(
                json.dumps(result, ensure_ascii=False, default=str),
                tool_name=call.name,
            ),
            tool_call_id=call.call_id,
            name=call.name,
        )
    )


def _decode_stored_payload(raw: str | None) -> dict[str, Any] | None:
    """Parse a persisted ``payload_json`` column, tolerating corruption."""
    if not raw:
        return None
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def _tool_calls_from_payload(payload: dict[str, Any]) -> list[ToolCallRef]:
    """Rebuild ``ToolCallRef`` list from a stored assistant payload."""
    raw_calls = payload.get("tool_calls")
    if not isinstance(raw_calls, list):
        return []
    refs: list[ToolCallRef] = []
    for item in raw_calls:
        if not isinstance(item, dict):
            continue
        call_id = item.get("call_id")
        name = item.get("name")
        arguments = item.get("arguments")
        if not isinstance(call_id, str) or not isinstance(name, str):
            continue
        if not isinstance(arguments, dict):
            arguments = {}
        refs.append(ToolCallRef(call_id=call_id, name=name, arguments=arguments))
    return refs


def _thread_history(thread: ChatThread) -> list[ProviderMessage]:
    """Convert a thread's persisted messages to provider input."""
    messages: list[ProviderMessage] = []
    for stored in thread.messages:
        payload = _decode_stored_payload(stored.payload_json)
        if stored.role == "tool":
            name = "tool"
            call_id = "tool"
            if payload:
                if isinstance(payload.get("name"), str):
                    name = payload["name"]
                if isinstance(payload.get("call_id"), str):
                    call_id = payload["call_id"]
                elif name:
                    call_id = name
            messages.append(
                ProviderMessage(
                    role="tool",
                    content=compact_tool_content(stored.content, tool_name=name),
                    tool_call_id=call_id,
                    name=name,
                )
            )
            continue
        if stored.role == "assistant" and payload:
            tool_calls = _tool_calls_from_payload(payload)
            if tool_calls:
                messages.append(ProviderMessage(role="assistant", content=stored.content, tool_calls=tool_calls))
                continue
        if stored.role in {"user", "assistant", "system"}:
            messages.append(ProviderMessage(role=stored.role, content=stored.content))
    return messages


def _with_system_prompt(history: list[ProviderMessage]) -> list[ProviderMessage]:
    """Prepend the grounding system prompt when history lacks one."""
    if history and history[0].role == "system":
        return bound_history(history)
    return bound_history([ProviderMessage(role="system", content=build_system_prompt()), *history])


def _dedupe_citations(citations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Drop duplicate law/article pairs while preserving order."""
    seen: set[tuple[str, str]] = set()
    out: list[dict[str, Any]] = []
    for citation in citations:
        law_id = citation.get("law_id")
        if not isinstance(law_id, str) or not law_id:
            continue
        article = citation.get("article_number")
        article_key = article if isinstance(article, str) else ""
        key = (law_id, article_key)
        if key in seen:
            continue
        seen.add(key)
        out.append(citation)
    return out


def _assistant_tool_calls_payload(calls: list[ToolCallChunk]) -> dict[str, Any]:
    """Serialise intermediate assistant tool calls for persistence."""
    return {"tool_calls": [{"call_id": call.call_id, "name": call.name, "arguments": call.arguments} for call in calls]}


def _set_thread_model(session: Session, thread: ChatThread, model_id: str) -> None:
    """Persist the model used for the current turn on the thread row."""
    thread.model = model_id
    session.add(thread)
    session.commit()


def _refresh_and_load_history(session: Session, thread: ChatThread) -> list[ProviderMessage]:
    """Refresh *thread* from the DB and materialise its provider history.

    Both operations are synchronous SQLModel/SQLite calls (``refresh``
    hits the DB, ``thread.messages`` is a lazy relationship that loads on
    first access) — grouped into one helper so the caller can offload
    them to a worker thread with a single ``anyio.to_thread.run_sync``
    call (#77 S1.1).
    """
    session.refresh(thread)
    return _thread_history(thread)


async def stream_chat_reply(
    *,
    session: Session,
    thread: ChatThread,
    user_message_content: str,
    model_id: str,
) -> AsyncIterator[str]:
    """Async generator yielding SSE-formatted strings for one turn.

    The generator's contract:

    * Always starts by persisting the user turn (so reconnects / failures
      after this point still leave the message in the thread).
    * Emits one ``text`` event per provider chunk.
    * On clean completion, persists the assistant turn and emits
      ``done``.
    * On provider failure mid-stream, emits ``error`` and ``done`` but
      still persists whatever assistant content was received — partial
      replies are better than data loss.

    Mounting in a FastAPI handler: wrap in ``StreamingResponse(...,
    media_type="text/event-stream")``.
    """
    # 1. Persist the user turn first so a crash during streaming doesn't
    #    swallow the user's question. Sync SQLite commit — offloaded so it
    #    doesn't stall other concurrent requests/streams (#77 S1.1).
    await anyio.to_thread.run_sync(_persist_user_turn, session, thread, user_message_content)
    await anyio.to_thread.run_sync(_set_thread_model, session, thread, model_id)

    # 2. Resolve provider + assemble context.
    try:
        provider_key, model_name = split_model_id(model_id)
        provider = _provider_for(provider_key)
    except UnknownProviderError as exc:
        yield format_sse(
            SseEvent.ERROR,
            _sse_error_payload(detail=str(exc), code="unknown_provider"),
        )
        yield format_sse(SseEvent.DONE, {})
        return

    # Refresh so the freshly persisted user turn shows up in history.
    # Same offload rationale as above — ``refresh`` + the lazy
    # ``thread.messages`` load are both blocking DB calls.
    history = await anyio.to_thread.run_sync(_refresh_and_load_history, session, thread)
    history = _with_system_prompt(history)

    # 3. Stream. The agentic loop (#195) iterates ``stream_chat_typed``
    #    up to ``_MAX_TOOL_ITERATIONS`` times: each iteration either
    #    finishes with text (``stop`` → break) or with tool calls
    #    (``tool_use`` → dispatch + feed result back). Text deltas are
    #    accumulated so the assistant turn can be persisted whole at the
    #    end. Providers that haven't been upgraded to native tool-use
    #    yet fall back to ``stream_chat`` via the default
    #    ``stream_chat_typed`` impl on ``ChatProvider`` — behaves
    #    identically to the pre-#195 path (one iteration, text only).
    assistant_chunks: list[str] = []
    collected_sources: list[dict[str, Any]] = []
    stream_error: dict[str, str] | None = None
    corpus_degraded = False
    tools = [ToolSpec(**spec) for spec in TOOL_SPECS]

    def _is_tools_unsupported(error: ChatProviderError) -> bool:
        """True when the provider rejected the request *because* of tools.

        Small local models (gemma, many <7B) don't implement function
        calling, so Ollama answers 400 "does not support tools". We retry
        once without tools so the user still gets a (RAG-less) reply
        instead of an empty turn (#564).
        """
        msg = str(error).lower()
        return "does not support tools" in msg or ("tool" in msg and "not support" in msg)

    # Agentic loop with a one-shot degrade: the first attempt carries the
    # RAG tools; if the model can't do tool-use we retry once with none so
    # tool-incapable models still answer (without citations) instead of
    # erroring out to an empty turn.
    attempt_tools = tools
    while True:
        retry_without_tools = False
        try:
            for _ in range(_MAX_TOOL_ITERATIONS):
                finish_reason: str | None = None
                pending_calls: list[ToolCallChunk] = []
                iteration_text: list[str] = []
                async for typed in provider.stream_chat_typed(history, model_name, tools=attempt_tools):
                    if isinstance(typed, TextChunk):
                        if not typed.delta:
                            continue
                        assistant_chunks.append(typed.delta)
                        iteration_text.append(typed.delta)
                        yield format_sse(SseEvent.TEXT, {"delta": typed.delta})
                    elif isinstance(typed, ToolCallChunk):
                        pending_calls.append(typed)
                        yield format_sse(
                            SseEvent.TOOL_CALL,
                            {"call_id": typed.call_id, "name": typed.name, "args": typed.arguments},
                        )
                    elif isinstance(typed, FinishChunk):
                        finish_reason = typed.reason
                        break
                if not pending_calls or finish_reason == "stop":
                    break
                _record_assistant_tool_calls(history, pending_calls, content="".join(iteration_text))
                await anyio.to_thread.run_sync(
                    partial(
                        _persist_assistant_turn,
                        session,
                        thread,
                        "".join(iteration_text),
                        _assistant_tool_calls_payload(pending_calls),
                        model_id=model_id,
                    ),
                )
                for call in pending_calls:
                    # S4.1 (#90): tool dispatch is synchronous (SQLite scans,
                    # sometimes a cold embedding-index build) — running it
                    # inline on the event loop would freeze every other
                    # request/stream for the duration. Off-load to a worker
                    # thread, same pattern as ``api/warmup.py``.
                    result = await anyio.to_thread.run_sync(_run_tool_call, call)
                    for citation in _extract_citations(result, tool_name=call.name, tool_args=call.arguments):
                        collected_sources.append(citation)
                        yield format_sse(SseEvent.SOURCE, citation)
                    await anyio.to_thread.run_sync(_persist_tool_turn, session, thread, call, result)
                    _record_tool_outcome(history, call, result)
                collected_sources[:] = _dedupe_citations(collected_sources)
        except ChatProviderError as exc:
            if attempt_tools and _is_tools_unsupported(exc):
                # Degrade to a tool-less chat for this turn and start over.
                logger.info("Model %s rejected tools; retrying without tools", repr(model_name))
                assistant_chunks.clear()
                corpus_degraded = True
                yield format_sse(SseEvent.DEGRADED, {"reason": "tools_unsupported"})
                attempt_tools = []
                retry_without_tools = True
            else:
                # Both `provider_key` and `exc` are user-influenced. CodeQL's
                # py/log-injection query doesn't recognise `%r` as a sanitiser
                # even though it calls repr() at runtime, so we use explicit
                # repr() — same bytes, different static-analysis signal.
                logger.info("Provider %s stream failed: %s", repr(provider_key), repr(exc))
                error_code, error_detail = _classify_provider_error(exc)
                stream_error = _sse_error_payload(detail=error_detail, code=error_code)
                yield format_sse(SseEvent.ERROR, stream_error)
        except asyncio.CancelledError:
            # Sprint 6 rf-5: a CancelledError means the client disconnected
            # (Starlette propagates it through the generator). We must NOT
            # swallow it — the generic `except Exception` below used to, which
            # turned a normal disconnect into a synthetic SSE `error` event
            # that no client could see anyway. Re-raise so the runtime can
            # tear the stream down cleanly.
            raise
        except Exception:
            # Generic exception path: the message can carry stack-frame
            # context (file paths, internal SQL, model names). Log the full
            # trace on the server side and emit a generic detail to the
            # client (CodeQL alert #2 — py/stack-trace-exposure).
            logger.exception("Unexpected error during chat stream")
            stream_error = _sse_error_payload(
                detail="Internal error during chat stream",
                code="internal_error",
            )
            yield format_sse(SseEvent.ERROR, stream_error)
        # One-shot retry without tools (see _is_tools_unsupported); any other
        # outcome (success, surfaced error, generic failure) ends the loop.
        if retry_without_tools:
            continue
        break

    # 4. Persist whatever we got. Even an empty reply gets a row so the
    #    UI doesn't render a "ghost turn". Offloaded for the same reason
    #    as the user-turn persist above (#77 S1.1).
    final_payload: dict[str, Any] = {}
    if collected_sources:
        final_payload["sources"] = collected_sources
    if stream_error:
        final_payload["error"] = stream_error
    if corpus_degraded:
        final_payload["corpus_degraded"] = True
    await anyio.to_thread.run_sync(
        partial(
            _persist_assistant_turn,
            session,
            thread,
            "".join(assistant_chunks),
            final_payload or None,
            model_id=model_id,
        ),
    )
    await anyio.to_thread.run_sync(_maybe_auto_title_thread, session, thread, user_message_content)

    yield format_sse(SseEvent.DONE, {})
