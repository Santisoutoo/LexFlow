"""Hardware + local-provider detection for the model wizard (#117/#118).

The endpoint that consumes this lives at ``GET /api/v1/system/profile``.
Inputs are read once on demand: RAM and CPU via ``psutil``, NVIDIA VRAM
via ``pynvml`` (graceful fail if there is no GPU), Apple Silicon via
``platform.machine()``, and the local LLM providers via short-timeout
HTTP probes against the ports they bind by default.

--- WHERE TO CHANGE IF X CHANGES ---
Probe endpoints       → ``OLLAMA_TAGS_URL`` / ``LMSTUDIO_MODELS_URL``.
NVML binding swap     → ``_collect_gpu_info`` (single place that imports nvml).
Wizard tiering rules  → frontend ``components/domain/ModelWizard.tsx``;
                        this module only reports raw numbers.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import platform
from dataclasses import dataclass

import httpx
import psutil

logger = logging.getLogger(__name__)

# Local provider endpoints + their default ports. Both Ollama and LM Studio
# bind to localhost only by default, so we don't need to scan a range.
OLLAMA_TAGS_URL = "http://127.0.0.1:11434/api/tags"
LMSTUDIO_MODELS_URL = "http://127.0.0.1:1234/v1/models"

# Per-probe HTTP budget. ``asyncio.wait_for`` adds a hard ceiling so a
# slow/half-open port cannot stall ``GET /system/profile``.
PROBE_TIMEOUT_SECONDS = 2.0
_PROBE_HTTP_TIMEOUT = httpx.Timeout(connect=0.3, read=0.5, write=0.5, pool=0.5)
# Probes run in parallel; outer budget must exceed each probe's wait_for ceiling.
_PROFILE_BUILD_CEILING_SECONDS = PROBE_TIMEOUT_SECONDS + 0.5


@dataclass(frozen=True)
class GpuInfo:
    """Single-GPU summary, or empty when no NVIDIA GPU is present."""

    present: bool
    vram_gb: float | None
    name: str | None


@dataclass(frozen=True)
class SystemProfile:
    """Plain dataclass mirror of ``SystemProfileResponse``.

    Built by ``build_system_profile`` and converted to the Pydantic
    response inside the router. Keeping the domain object separate from
    the wire schema lets the wizard logic depend on stable types.
    """

    total_ram_gb: float
    available_ram_gb: float
    cpu_cores: int
    has_nvidia_gpu: bool
    vram_gb: float | None
    gpu_name: str | None
    is_apple_silicon: bool
    platform: str
    ollama_running: bool
    ollama_models: list[str]
    lmstudio_running: bool


# ─── RAM + CPU ───────────────────────────────────────────────────────────


def _collect_memory_info() -> tuple[float, float]:
    """Return (total_ram_gb, available_ram_gb), rounded to 1 decimal."""
    vm = psutil.virtual_memory()
    total = round(vm.total / 1024**3, 1)
    available = round(vm.available / 1024**3, 1)
    return total, available


def _collect_cpu_cores() -> int:
    """Logical CPU count (including hyperthreads). ``psutil`` returns
    ``None`` only on exotic platforms; default to 1 so the wizard
    doesn't divide by zero."""
    return psutil.cpu_count(logical=True) or 1


# ─── GPU ─────────────────────────────────────────────────────────────────


def _collect_gpu_info() -> GpuInfo:
    """Detect NVIDIA GPU + VRAM via NVML. Returns an empty ``GpuInfo``
    when NVML isn't installed, the driver isn't loaded, or no device is
    available. Every failure path is treated as "no GPU" because the
    wizard wants a boolean signal, not a stack trace."""
    try:
        import pynvml
    except ImportError:
        logger.debug("pynvml not installed; reporting no NVIDIA GPU")
        return GpuInfo(present=False, vram_gb=None, name=None)

    try:
        pynvml.nvmlInit()
    except Exception as exc:
        logger.debug("NVML init failed (%s); reporting no NVIDIA GPU", exc)
        return GpuInfo(present=False, vram_gb=None, name=None)

    try:
        count = pynvml.nvmlDeviceGetCount()
        if count == 0:
            return GpuInfo(present=False, vram_gb=None, name=None)
        # If the box has multiple GPUs we surface the first; the wizard
        # only needs to know "does enough VRAM exist somewhere". Future
        # multi-GPU UX would extend the schema to a list.
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        mem_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
        raw_name = pynvml.nvmlDeviceGetName(handle)
        name = raw_name.decode("utf-8") if isinstance(raw_name, bytes) else raw_name
        vram_gb = round(mem_info.total / 1024**3, 1)
        return GpuInfo(present=True, vram_gb=vram_gb, name=name)
    except Exception as exc:
        logger.debug("NVML query failed (%s); reporting no NVIDIA GPU", exc)
        return GpuInfo(present=False, vram_gb=None, name=None)
    finally:
        with contextlib.suppress(Exception):
            pynvml.nvmlShutdown()


# ─── Platform ────────────────────────────────────────────────────────────


def _detect_apple_silicon() -> bool:
    """True on Apple Silicon (ARM64 macOS). False on Intel Macs, Linux,
    Windows, and ARM Linux/Windows boxes."""
    return platform.system() == "Darwin" and platform.machine() == "arm64"


def _platform_label() -> str:
    """Short platform label (``linux`` / ``darwin`` / ``windows``)."""
    return platform.system().lower()


# ─── Local provider probes ───────────────────────────────────────────────


async def _probe_ollama(client: httpx.AsyncClient) -> tuple[bool, list[str]]:
    """Probe Ollama's ``/api/tags`` and return (running, model_names).

    Failure → ``(False, [])`` so the wizard surfaces "not detected" and
    the user can start the server.
    """
    try:
        response = await asyncio.wait_for(
            client.get(OLLAMA_TAGS_URL, timeout=_PROBE_HTTP_TIMEOUT),
            timeout=PROBE_TIMEOUT_SECONDS + 0.1,
        )
        response.raise_for_status()
        payload = response.json()
        models = [m.get("name") for m in payload.get("models", []) if m.get("name")]
        return True, models
    except Exception as exc:
        logger.debug("Ollama probe failed (%s); reporting not running", exc)
        return False, []


async def _probe_lmstudio(client: httpx.AsyncClient) -> bool:
    """Probe LM Studio's OpenAI-compatible ``/v1/models`` endpoint.

    LM Studio doesn't expose a friendly model-listing format like Ollama
    does, so we only report whether the server is up. The wizard surfaces
    a manual "pick a model in LM Studio" step when this is the chosen
    provider.
    """
    try:
        response = await asyncio.wait_for(
            client.get(LMSTUDIO_MODELS_URL, timeout=_PROBE_HTTP_TIMEOUT),
            timeout=PROBE_TIMEOUT_SECONDS + 0.1,
        )
        response.raise_for_status()
        return True
    except Exception as exc:
        logger.debug("LM Studio probe failed (%s); reporting not running", exc)
        return False


# ─── Orchestrator ────────────────────────────────────────────────────────


async def _build_system_profile_inner() -> SystemProfile:
    """Collect hardware + provider probes (no outer timeout)."""
    total_ram_gb, available_ram_gb = _collect_memory_info()
    cpu_cores = _collect_cpu_cores()
    gpu = _collect_gpu_info()
    is_apple_silicon = _detect_apple_silicon()
    platform_label = _platform_label()

    async with httpx.AsyncClient() as client:
        (ollama_running, ollama_models), lmstudio_running = await asyncio.gather(
            _probe_ollama(client),
            _probe_lmstudio(client),
        )

    return SystemProfile(
        total_ram_gb=total_ram_gb,
        available_ram_gb=available_ram_gb,
        cpu_cores=cpu_cores,
        has_nvidia_gpu=gpu.present,
        vram_gb=gpu.vram_gb,
        gpu_name=gpu.name,
        is_apple_silicon=is_apple_silicon,
        platform=platform_label,
        ollama_running=ollama_running,
        ollama_models=ollama_models,
        lmstudio_running=lmstudio_running,
    )


async def build_system_profile() -> SystemProfile:
    """Build a snapshot of host hardware + running local LLM providers.

    Hardware probes are sub-millisecond synchronous calls; the LLM
    provider probes run concurrently with a tight cap each so the
    endpoint stays under ~2.5 s even when both servers are down.
    """
    try:
        return await asyncio.wait_for(_build_system_profile_inner(), timeout=_PROFILE_BUILD_CEILING_SECONDS)
    except TimeoutError:
        logger.debug("build_system_profile hit hard ceiling (%.1fs)", _PROFILE_BUILD_CEILING_SECONDS)
        total_ram_gb, available_ram_gb = _collect_memory_info()
        cpu_cores = _collect_cpu_cores()
        gpu = _collect_gpu_info()
        is_apple_silicon = _detect_apple_silicon()
        platform_label = _platform_label()
        return SystemProfile(
            total_ram_gb=total_ram_gb,
            available_ram_gb=available_ram_gb,
            cpu_cores=cpu_cores,
            has_nvidia_gpu=gpu.present,
            vram_gb=gpu.vram_gb,
            gpu_name=gpu.name,
            is_apple_silicon=is_apple_silicon,
            platform=platform_label,
            ollama_running=False,
            ollama_models=[],
            lmstudio_running=False,
        )
