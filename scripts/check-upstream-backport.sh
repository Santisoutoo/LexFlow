#!/usr/bin/env bash
# Detect fork commits (on this repo's main) that are genuine candidates for
# backporting to upstream (VforVitorio/LexFlow), vs. ones already absorbed
# there under a different hash/message (the fork's usual backport process
# rewrites author + issue-number comments before opening the upstream PR,
# so the hash never matches — see CLAUDE.md §4.1).
#
# A commit is a candidate only if at least one file it touches still
# *differs* between upstream/main and origin/main right now. A commit not
# being an ancestor of upstream/main is NOT enough on its own — that's true
# of every fork commit by definition, including ones already ported.
#
# Never flags .github/agent/**, the agent-loop/external-pr-review/
# orca-supervisor workflows, or docs/agent-loop/** — those are fork-only
# infra and are excluded from the search entirely.
#
# Usage: bash scripts/check-upstream-backport.sh

set -euo pipefail

UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/VforVitorio/LexFlow.git}"
PRODUCT_PATHS=(src/ frontend/ tests/ 'docs/' ':!docs/agent-loop/')

if ! git remote get-url upstream >/dev/null 2>&1; then
  echo "Adding 'upstream' remote ($UPSTREAM_URL)..." >&2
  git remote add upstream "$UPSTREAM_URL"
fi

echo "Fetching upstream/main..." >&2
git fetch upstream main --quiet

candidates=0
while IFS= read -r sha; do
  [ -z "$sha" ] && continue

  mapfile -t files < <(git show --format='' --name-only "$sha" -- "${PRODUCT_PATHS[@]}")
  [ "${#files[@]}" -eq 0 ] && continue

  differing=()
  for f in "${files[@]}"; do
    if ! git diff --quiet upstream/main origin/main -- "$f" 2>/dev/null; then
      differing+=("$f")
    fi
  done

  if [ "${#differing[@]}" -gt 0 ]; then
    candidates=$((candidates + 1))
    subject=$(git show -s --format='%s' "$sha")
    echo ""
    echo "⚠ $sha  $subject"
    for f in "${differing[@]}"; do
      echo "    $f"
    done
  fi
done < <(git log --no-merges --format='%H' upstream/main..origin/main -- "${PRODUCT_PATHS[@]}")

echo ""
if [ "$candidates" -eq 0 ]; then
  echo "No backport candidates — origin/main is in sync with upstream/main on product paths."
else
  echo "$candidates commit(s) with real drift from upstream/main — review before backporting (see CLAUDE.md §4.1)."
fi
