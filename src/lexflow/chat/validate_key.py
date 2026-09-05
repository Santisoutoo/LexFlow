"""Probe a cloud-provider API key without echoing or logging the secret.

Used by ``POST /api/v1/secrets/{provider}/test``. Each probe makes a real
HTTP call — Anthropic and Google ``list_models()`` are static catalogues
and would otherwise report every key as valid.

Invariants:
* The key is never logged, never included in :class:`KeyTestResult`.
* Client-facing ``message`` values are static (same pattern as the
  provider wrappers). SDK exception text stays on ``__cause__``.
* A 5 s ceiling keeps a hung provider from blocking the wizard.

--- WHERE TO CHANGE IF X CHANGES ---
* Cheap probe models     → ``_ANTHROPIC_PROBE_MODEL`` / ``_GOOGLE_PROBE_MODEL``.
* New cloud provider     → add a branch in :func:`_probe` and a row in
                            :data:`lexflow.chat.secrets.SUPPORTED_PROVIDERS`.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Final

from lexflow.chat.base import ChatProviderError
from lexflow.chat.providers.openai_provider import OpenAIProvider
from lexflow.chat.secrets import SUPPORTED_PROVIDERS

logger = logging.getLogger(__name__)

PROBE_TIMEOUT_S: Final[float] = 5.0

# Cheapest current IDs from the provider catalogues — auth-only probes.
# Bump alongside ``_ANTHROPIC_MODELS`` / ``_GOOGLE_MODELS`` when the line moves.
_ANTHROPIC_PROBE_MODEL: Final[str] = "claude-haiku-4-5-20251001"
_GOOGLE_PROBE_MODEL: Final[str] = "gemini-2.0-flash-lite"

CODE_INVALID_API_KEY: Final[str] = "invalid_api_key"
CODE_PROBE_TIMEOUT: Final[str] = "probe_timeout"
CODE_PROBE_ERROR: Final[str] = "probe_error"
CODE_RATE_LIMITED: Final[str] = "rate_limited"

_STATIC_MESSAGES: Final[dict[str, str]] = {
    CODE_INVALID_API_KEY: "Invalid API key",
    CODE_PROBE_TIMEOUT: "Provider did not respond in time",
    CODE_PROBE_ERROR: "Could not validate API key",
    CODE_RATE_LIMITED: "Provider rate limit exceeded",
}

_AUTH_MARKERS: Final[tuple[str, ...]] = (
    "authentication failed",
    "authenticationerror",
    "invalid api key",
    "api_key_invalid",
    "api key not valid",
    "unauthorized",
    "unauthenticated",
    "permission_denied",
)
_RATE_MARKERS: Final[tuple[str, ...]] = ("rate limit", "ratelimit", "resource_exhausted")


@dataclass(frozen=True)
class KeyTestResult:
    """Outcome of a provider key probe. Never carries the key bytes."""

    valid: bool
    code: str | None
    message: str | None


def _ok() -> KeyTestResult:
    return KeyTestResult(valid=True, code=None, message=None)


def _fail(code: str) -> KeyTestResult:
    return KeyTestResult(valid=False, code=code, message=_STATIC_MESSAGES[code])


def _classify_exception(exc: BaseException) -> str:
    """Map an SDK / wrapper error onto a static result code.

    Combines the exception type name and message so we can recognise
    auth failures without forwarding the (possibly key-bearing) text.
    Walks ``__cause__`` one hop so a wrapped ``ChatProviderError`` still
    sees the SDK's ``AuthenticationError``.
    """
    cause = exc.__cause__
    candidates: tuple[BaseException, ...] = (exc, cause) if cause is not None and cause is not exc else (exc,)
    for item in candidates:
        name = type(item).__name__.lower()
        text = str(item).lower()
        combined = f"{name} {text}"
        if any(marker in combined for marker in _AUTH_MARKERS):
            return CODE_INVALID_API_KEY
        if any(marker in combined for marker in _RATE_MARKERS):
            return CODE_RATE_LIMITED
    return CODE_PROBE_ERROR


async def _probe_openai(api_key: str) -> None:
    """``list_models`` hits OpenAI and maps auth errors to ChatProviderError."""
    provider = OpenAIProvider(api_key=api_key)
    await provider.list_models()


async def _probe_anthropic(api_key: str) -> None:
    """Anthropic ``list_models`` is static — send a 1-token Messages call."""
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=api_key)
    try:
        await client.messages.create(
            model=_ANTHROPIC_PROBE_MODEL,
            max_tokens=1,
            messages=[{"role": "user", "content": "."}],
        )
    except anthropic.AuthenticationError as exc:
        raise ChatProviderError("Anthropic authentication failed") from exc
    except anthropic.RateLimitError as exc:
        raise ChatProviderError("Anthropic rate limit exceeded") from exc


async def _probe_google(api_key: str) -> None:
    """Google ``list_models`` is static — send a 1-token generate_content."""
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    try:
        await client.aio.models.generate_content(
            model=_GOOGLE_PROBE_MODEL,
            contents=".",
            config=types.GenerateContentConfig(max_output_tokens=1),
        )
    except Exception as exc:
        raise ChatProviderError("Google Gemini error") from exc


async def _probe(provider: str, api_key: str) -> None:
    if provider == "openai":
        await _probe_openai(api_key)
        return
    if provider == "anthropic":
        await _probe_anthropic(api_key)
        return
    if provider == "google":
        await _probe_google(api_key)
        return
    raise ValueError(f"Unsupported provider for key probe: {provider!r}")


async def test_api_key(provider: str, api_key: str) -> KeyTestResult:
    """Validate ``api_key`` against ``provider``. Never logs the key.

    ``provider`` must already be one of :data:`SUPPORTED_PROVIDERS`; the
    router is responsible for the 400 on unknown names.
    """
    if provider not in SUPPORTED_PROVIDERS:
        raise ValueError(f"Unsupported provider for key probe: {provider!r}")

    try:
        await asyncio.wait_for(_probe(provider, api_key), timeout=PROBE_TIMEOUT_S)
    except TimeoutError:
        logger.info("Key probe timed out for %s after %.1fs", provider, PROBE_TIMEOUT_S)
        return _fail(CODE_PROBE_TIMEOUT)
    except ChatProviderError as exc:
        code = _classify_exception(exc)
        logger.info("Key probe failed for %s: %s", provider, code)
        return _fail(code)
    except Exception as exc:
        # Type name only — SDK messages can echo a partial key.
        logger.info("Key probe failed for %s with an unexpected error: %s", provider, type(exc).__name__)
        return _fail(CODE_PROBE_ERROR)

    logger.info("Key probe succeeded for %s", provider)
    return _ok()
