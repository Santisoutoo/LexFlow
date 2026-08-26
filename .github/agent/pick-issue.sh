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
# engine, model, cursor_available=true|false. The issue body is written to
# $RUNNER_TEMP/issue-body.md — it is data for the worker prompt, never
# evaluated by the shell.
#
# cursor_available exists so later steps can gate an `if:` on whether the
# secret is configured WITHOUT referencing `secrets` directly in a step
# `if:` — GitHub rejects that at workflow-dispatch validation time with
# "Unrecognized named-value: 'secrets'" (hit for real in agent-loop.yml,
# 2026-08-24, PR #101).
#
# Engine routing: frontend issues go to Cursor (Codex-class models on the
# Cursor subscription); everything else goes to OpenCode Go. If CURSOR_API_KEY
# is not configured the workflow falls back to OpenCode, so the cursor route
# is best-effort. The reviewer runs its own frontier-first cascade (Cursor's
# "Other Models" pool, then OpenCode kimi-k3) — see agent-loop.yml's Review
# step, not this file.
set -euo pipefail

ALLOWED_AUTHORS='["VforVitorio", "Santisoutoo"]'
EXCLUDED_LABELS='["epic", "agent:wip", "agent:blocked", "agent:infra-stuck", "area: ci-cd", "question", "wontfix", "duplicate", "invalid"]'

# Implementation (worker), general issues — Chinese OSS models via OpenCode
# Go, cheapest-first among flagship-class options. Tier picked automatically
# by derive_model() from how many prior infra failures this issue already
# has (see infra_attempt_tier()) — tier 0 is the primary pick, 1/2 are the
# auto-escalation on repeat failure of the SAME issue:
#   0) opencode-go/kimi-k3     Moonshot, flagship, $3.00/$15.00 per M
#   1) opencode-go/glm-5.2     Zhipu,    $1.40/$4.40 per M  — cheaper flagship-class alt
#   2) opencode-go/qwen3.7-max Alibaba,  $2.50/$7.50 per M  — architecture-leaning alt
# NOTE: all opencode-go/* models draw on the SAME pooled $12/5h budget — this
# tiering diversifies against a model/prompt-specific hang, not against pool
# exhaustion. Pool exhaustion is handled at the engine level, see
# agent-loop.yml's circuit-breaker step (FORCE_ENGINE below).
MODEL_TOP=(opencode-go/kimi-k3 opencode-go/glm-5.2 opencode-go/qwen3.7-max)

# Implementation for area: docs — prose-heavy, cheapest tier. Same
# auto-escalation-by-tier scheme as MODEL_TOP:
#   0) opencode-go/minimax-m3        MiniMax, $0.30/$1.20 per M
#   1) opencode-go/deepseek-v4-flash DeepSeek, $0.14/$0.22-0.66 per M — cheapest, high volume
#   2) opencode-go/mimo-v2.5         Xiaomi,  $0.14/$0.28 per M — equally cheap, different vendor
MODEL_DOCS=(opencode-go/minimax-m3 opencode-go/deepseek-v4-flash opencode-go/mimo-v2.5)

# Implementation for area: tests — needs to read real code (asserts, mocks,
# edge cases), not pure prose, so it gets an escalation option docs doesn't:
#   0) opencode-go/minimax-m3        MiniMax, $0.30/$1.20 per M — mechanical fixtures/asserts
#   1) opencode-go/glm-5.2           Zhipu,   $1.40/$4.40 per M — escalate for tests needing complex logic
#   2) opencode-go/deepseek-v4-flash DeepSeek, $0.14/$0.22-0.66 per M — ultra-cheap for large/simple batches
MODEL_TESTS=(opencode-go/minimax-m3 opencode-go/glm-5.2 opencode-go/deepseek-v4-flash)

# Cursor engine (area: frontend), all in the Pro plan's included "Cursor
# Models" pool (no draw on the $20/mo "Other Models" allowance):
#   0) composer-2.5   agent-native, cheapest in the included pool
#   1) grok-4.5       same included pool, alt if Composer quality/quota lags
#   2) grok-4.6       same included pool, second alt
# Escalating further to gpt-5.3-codex (Other Models pool) is possible but
# competes with the reviewer's frontier budget in agent-loop.yml — reserve
# for genuinely hard frontend issues, not a routine swap, so it's not in
# this auto-tier chain.
MODEL_CURSOR=(composer-2.5 grok-4.5 grok-4.6)

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
  # FORCE_ENGINE is set by agent-loop.yml's circuit-breaker step when the
  # last 3 runs all failed on opencode — opencode-go's pooled budget may be
  # exhausted, so route to Cursor (a genuinely separate budget) regardless
  # of area label. Falls through to normal routing if Cursor isn't configured.
  if [ "${FORCE_ENGINE:-}" = "cursor" ] && [ "${CURSOR_AVAILABLE:-false}" = "true" ]; then
    echo "cursor"
  elif [ "${CURSOR_AVAILABLE:-false}" = "true" ] \
     && echo "$labels" | jq -e 'index("area: frontend")' >/dev/null; then
    echo "cursor"
  else
    echo "opencode"
  fi
}

# How many prior <!-- agent-infra --> failures this issue already has, capped
# at 2 (a 3rd infra failure gets it labeled agent:infra-stuck and excluded
# from the picker entirely — see agent-loop.yml Cleanup — so tier 2 is the
# highest this function ever needs to return).
infra_attempt_tier() {
  local number="$1"
  local count
  count=$(gh issue view "$number" --json comments \
    --jq '[.comments[].body | select(contains("<!-- agent-infra -->"))] | length')
  if [ "$count" -gt 2 ]; then count=2; fi
  echo "$count"
}

derive_model() {
  local engine="$1" labels="$2" tier="$3"
  if [ "$engine" = "cursor" ]; then
    echo "${MODEL_CURSOR[$tier]}"
  elif echo "$labels" | jq -e 'index("area: tests")' >/dev/null; then
    echo "${MODEL_TESTS[$tier]}"
  elif echo "$labels" | jq -e 'index("area: docs")' >/dev/null; then
    echo "${MODEL_DOCS[$tier]}"
  else
    echo "${MODEL_TOP[$tier]}"
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

  local engine tier
  engine=$(derive_engine "$labels")
  tier=$(infra_attempt_tier "$number")
  {
    echo "empty=false"
    echo "number=$number"
    echo "title=${title//$'\n'/ }"
    echo "branch_prefix=$(derive_branch_prefix "$labels")"
    echo "engine=$engine"
    echo "model=$(derive_model "$engine" "$labels" "$tier")"
    echo "cursor_available=${CURSOR_AVAILABLE:-false}"
  } >> "$GITHUB_OUTPUT"
  if [ "$tier" != "0" ]; then
    echo "Model tier escalated to $tier (issue #$number has $tier prior infra failure(s))."
  fi
  echo "Picked #$number ($title)"
}

main "$@"
