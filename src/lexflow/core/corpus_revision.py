"""Resolve the legalize-es corpus revision — the shared cache-invalidation key.

Every on-disk cache (graph, metadata, search) keys off the submodule's HEAD
commit so a corpus update (git pull / sync) invalidates them together. Lives in
``core`` so the metadata and search caches don't have to reach up into the graph
layer for it (graph/cache.py originally owned this helper).

When the corpus is shipped without ``.git`` (PyInstaller, Docker), a sibling
``corpus_revision.txt`` under ``data_path.parent`` supplies the revision so
disk caches stay warm across launches (#42 R4).
"""

from __future__ import annotations

import logging
import re
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

UNKNOWN_REVISION = "unknown"
CORPUS_REVISION_FILENAME = "corpus_revision.txt"
_REVISION_PATTERN = re.compile(r"^[0-9a-f]{7,40}$", re.IGNORECASE)


def _revision_file_path(data_path: Path) -> Path:
    """Path to the packaged/synced revision marker next to on-disk caches."""
    return data_path.parent / CORPUS_REVISION_FILENAME


def _read_revision_file(data_path: Path) -> str | None:
    """Load a persisted revision when git is unavailable."""
    revision_path = _revision_file_path(data_path)
    if not revision_path.is_file():
        return None
    try:
        revision = revision_path.read_text(encoding="utf-8").strip()
    except OSError:
        logger.warning("Failed to read %s", revision_path, exc_info=True)
        return None
    if not revision or not _REVISION_PATTERN.fullmatch(revision):
        logger.warning("Ignoring invalid corpus revision in %s", revision_path)
        return None
    return revision.lower()


def _git_revision(data_path: Path) -> str | None:
    """Return HEAD of the corpus checkout, or ``None`` when git is unavailable."""
    try:
        result = subprocess.check_output(
            ["git", "-C", str(data_path), "rev-parse", "HEAD"],
            stderr=subprocess.DEVNULL,
        )
        if isinstance(result, bytes):
            return result.decode().strip()
        return str(result).strip()
    except (subprocess.CalledProcessError, OSError):
        return None


def submodule_hash(data_path: Path) -> str:
    """Return the corpus revision used to key on-disk caches.

    Resolution order: git HEAD in *data_path*, then ``corpus_revision.txt``
    beside the cache directory, else :data:`UNKNOWN_REVISION`. Never raises.
    """
    git_revision = _git_revision(data_path)
    if git_revision:
        return git_revision
    file_revision = _read_revision_file(data_path)
    if file_revision:
        return file_revision
    return UNKNOWN_REVISION


def write_corpus_revision(data_path: Path, revision: str | None = None) -> str:
    """Persist the current corpus revision for cache hits without ``.git``.

    Writes atomically to ``data_path.parent / corpus_revision.txt``. When git
    is available the commit SHA is used; otherwise the existing file revision
    is kept if valid. Callers that already resolved the revision (e.g. sync)
    can pass it to avoid a second git invocation.
    """
    revision = revision or _git_revision(data_path) or _read_revision_file(data_path)
    if not revision:
        logger.warning("Cannot write corpus revision: no git HEAD and no valid file")
        return UNKNOWN_REVISION

    revision_path = _revision_file_path(data_path)
    revision_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = revision_path.with_suffix(".tmp")
    tmp_path.write_text(f"{revision}\n", encoding="utf-8")
    tmp_path.replace(revision_path)
    return revision
