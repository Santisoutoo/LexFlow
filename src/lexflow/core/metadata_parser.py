"""Fast metadata-only parser.

Reads only the YAML frontmatter of a law file without parsing the full
Markdown body.  Used for bulk operations like listing all 12K laws.
"""

from __future__ import annotations

from pathlib import Path

from lexflow.core.models import LawMetadata
from lexflow.core.parser import frontmatter_to_metadata, parse_frontmatter
from lexflow.utils.file_discovery import law_id_from_path


def read_frontmatter_block(file_path: Path) -> str:
    """Read only the YAML frontmatter from a file without loading the full content.

    Scans line-by-line until the closing ``---`` delimiter so oversized
    frontmatter blocks (long ``references_*`` fields) are not truncated.
    """
    with file_path.open("r", encoding="utf-8") as fh:
        opening = fh.readline()
        if opening.strip() != "---":
            return ""

        lines: list[str] = []
        for line in fh:
            if line.strip() == "---":
                return "".join(lines)
            lines.append(line)

    # No closing delimiter — treat EOF as end of frontmatter (#44 R9).
    return "".join(lines)


def parse_metadata_only(file_path: Path) -> LawMetadata:
    """Read a ``.md`` file and extract only the YAML frontmatter as :class:`LawMetadata`.

    Much faster than :func:`~lexflow.core.parser.parse_law_file` because it
    reads only the frontmatter block and skips body parsing entirely.
    """
    yaml_text = read_frontmatter_block(file_path)
    raw = parse_frontmatter(yaml_text)
    metadata = frontmatter_to_metadata(raw)
    if not metadata.identifier.strip():
        stem = law_id_from_path(file_path)
        if stem:
            metadata = metadata.model_copy(update={"identifier": stem})
    return metadata
