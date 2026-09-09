"""Write ``data/corpus_revision.txt`` for cache hits without a git checkout.

Used at package/image build time when the corpus is copied without ``.git``.
"""

from __future__ import annotations

import sys
from pathlib import Path

from lexflow.core.corpus_revision import UNKNOWN_REVISION, write_corpus_revision


def main() -> int:
    """Persist the corpus revision next to on-disk caches."""
    data_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("data/legalize-es")
    revision = write_corpus_revision(data_path)
    if revision == UNKNOWN_REVISION:
        print(f"warning: could not resolve revision for {data_path}", file=sys.stderr)
        return 1
    print(revision)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
