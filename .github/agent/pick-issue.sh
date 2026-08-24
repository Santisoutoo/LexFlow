#!/usr/bin/env bash
# Picks the next implementable issue for the autonomous agent loop.
#
# Security: only issues authored by the explicit allowlist are eligible —
# this is a public repo and the worker executes with repo-write credentials,
# so a stranger's issue body must never reach the agent. The allowlist is the
# primary filter on purpose (authorAssociation alone is weaker: CONTRIBUTOR
# is granted to anyone with a merged PR).
#
# Outputs (to $GITHUB_OUTPUT): empty=true|false, number, title, branch_prefix,
# engine, model. The issue body is written to $RUNNER_TEMP/issue-body.md — it
# is data for the worker prompt, never evaluated by the shell.
#
# Engine routing: frontend issues go to Cursor (Codex-class models on the
# Cursor subscription); everything else goes to OpenCode Go. If CURSOR_API_KEY
# is not configured the workflow falls back to OpenCode, so the cursor route
# is best-effort. The reviewer runs its own frontier-first cascade (Cursor's
# "Other Models" pool, then OpenCode kimi-k3) — see agent-loop.yml's Review
# step, not this file.
set -euo pipefail

ALLOWED_AUTHORS='["VforVitorio", "Santisoutoo"]'
EXCLUDED_LABELS='["epic", "agent:wip", "agent:blocked", "area: ci-cd", "question", "wontfix", "duplicate", "invalid"]'

# Implementation (worker), general issues — Chinese OSS models via OpenCode
# Go, cheapest-first among flagship-class options. Fallback chain if kimi-k3's
# $-cap is exhausted (manual swap here, no auto-retry):
#   1) opencode-go/kimi-k3     Moonshot, flagship, $3.00/$15.00 per M (current)
#   2) opencode-go/glm-5.2     Zhipu,    $1.40/$4.40 per M  — cheaper flagship-class alt
#   3) opencode-go/qwen3.7-max Alibaba,  $2.50/$7.50 per M  — architecture-leaning alt
MODEL_TOP="opencode-go/kimi-k3"

# Implementation for area: docs — prose-heavy, cheapest tier. Fallback chain:
#   1) opencode-go/minimax-m3        MiniMax, $0.30/$1.20 per M (current)
#   2) opencode-go/deepseek-v4-flash DeepSeek, $0.14/$0.22-0.66 per M — cheapest, high volume
#   3) opencode-go/mimo-v2.5         Xiaomi,  $0.14/$0.28 per M — equally cheap, different vendor
MODEL_DOCS="opencode-go/minimax-m3"

# Implementation for area: tests — needs to read real code (asserts, mocks,
# edge cases), not pure prose, so it gets an escalation option docs doesn't.
# Fallback chain:
#   1) opencode-go/minimax-m3        MiniMax, $0.30/$1.20 per M (current) — mechanical fixtures/asserts
#   2) opencode-go/glm-5.2           Zhipu,   $1.40/$4.40 per M — escalate for tests needing complex logic
#   3) opencode-go/deepseek-v4-flash DeepSeek, $0.14/$0.22-0.66 per M — ultra-cheap for large/simple batches
MODEL_TESTS="opencode-go/minimax-m3"

# Cursor engine (area: frontend), all in the Pro plan's included "Cursor
# Models" pool (no draw on the $20/mo "Other Models" allowance). Fallback:
#   1) composer-2.5      agent-native, cheapest in the included pool (current)
#   2) grok-4.5 / grok-4.6  same included pool, alt if Composer quality/quota lags
# Escalating further to gpt-5.3-codex (Other Models pool) is possible but
# competes with the reviewer's frontier budget in agent-loop.yml — reserve
# for genuinely hard frontend issues, not a routine swap.
MODEL_CURSOR="composer-2.5"

fetch_candidates() {
  gh issue list --state open --limit 200 \
    --json number,title,body,labels,author
}

# Filter + sort: allowlisted author, no excluded label, then order by
# priority label (high > medium > low > none), bug before enhancement,
# oldest (lowest number) first.
select_issue() {
  jq --argjson allowed "$ALLOWED_AUTHORS" --argjson excluded "$EXCLUDED_LABELS" '
    map(select(.author.login as $a | $allowed | index($a)))
    | map(select([.labels[].name] as $l | ($excluded | map(. as $e | $l | index($e)) | any) | not))
    | sort_by(
        ([.labels[].name] | if index("priority:high") then 0
                            elif index("priority:medium") then 1
                            elif index("priority:low") then 2
                            else 3 end),
        ([.labels[].name] | if index("bug") then 0 else 1 end),
        .number)
    | .[0] // empty'
}

derive_branch_prefix() {
  local labels="$1"
  if echo "$labels" | jq -e 'index("bug")' >/dev/null; then echo "fix"
  elif echo "$labels" | jq -e 'index("area: docs")' >/dev/null; then echo "docs"
  else echo "feat"
  fi
}

derive_engine() {
  local labels="$1"
  if [ "${CURSOR_AVAILABLE:-false}" = "true" ] \
     && echo "$labels" | jq -e 'index("area: frontend")' >/dev/null; then
    echo "cursor"
  else
    echo "opencode"
  fi
}

derive_model() {
  local engine="$1" labels="$2"
  if [ "$engine" = "cursor" ]; then
    echo "$MODEL_CURSOR"
  elif echo "$labels" | jq -e 'index("area: tests")' >/dev/null; then
    echo "$MODEL_TESTS"
  elif echo "$labels" | jq -e 'index("area: docs")' >/dev/null; then
    echo "$MODEL_DOCS"
  else
    echo "$MODEL_TOP"
  fi
}

main() {
  local issue
  if [[ -n "${FORCED_ISSUE:-}" ]]; then
    # workflow_dispatch override: fetch that one issue, but it must still
    # pass the same author/label filters — never a bypass.
    issue=$(gh issue view "$FORCED_ISSUE" --json number,title,body,labels,author,state \
      | jq --argjson allowed "$ALLOWED_AUTHORS" --argjson excluded "$EXCLUDED_LABELS" '
          select(.state == "OPEN")
          | select(.author.login as $a | $allowed | index($a))
          | select([.labels[].name] as $l | ($excluded | map(. as $e | $l | index($e)) | any) | not)
          // empty')
  else
    issue=$(fetch_candidates | select_issue)
  fi

  if [[ -z "$issue" ]]; then
    echo "No eligible issue found."
    echo "empty=true" >> "$GITHUB_OUTPUT"
    exit 0
  fi

  local number title labels
  number=$(echo "$issue" | jq -r '.number')
  title=$(echo "$issue" | jq -r '.title')
  labels=$(echo "$issue" | jq -c '[.labels[].name]')
  echo "$issue" | jq -r '.body' > "$RUNNER_TEMP/issue-body.md"

  local engine
  engine=$(derive_engine "$labels")
  {
    echo "empty=false"
    echo "number=$number"
    echo "title=${title//$'\n'/ }"
    echo "branch_prefix=$(derive_branch_prefix "$labels")"
    echo "engine=$engine"
    echo "model=$(derive_model "$engine" "$labels")"
  } >> "$GITHUB_OUTPUT"
  echo "Picked #$number ($title)"
}

main "$@"
