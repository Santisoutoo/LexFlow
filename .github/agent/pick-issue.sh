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
# Engine: always "cursor" (see run-engine.sh) — kept as an output for
# backward-compat with the rest of the workflow, which still threads it
# through to run-engine.sh.
#
# Selection: filtering (allowlisted author, no excluded label) stays a plain
# deterministic jq pass — cheap, and "already over-retried" is already a hard
# label exclusion (agent:blocked/agent:infra-stuck), not a judgment call.
# Choosing ONE issue among the survivors is delegated to an agent
# (picker-prompt.md, gpt-5.3-codex, read-only `--mode ask`) so it can weigh
# business context (declared dependencies, urgency in the body) instead of a
# blind priority/bug/number sort. If the agent's output doesn't parse or
# doesn't name an eligible candidate, select_issue() falls back to that same
# deterministic sort — the picker must never be a new single point of failure
# for the whole loop. Either way, the choice is written as a comment
# (`<!-- agent-picker -->`) on the picked issue: reasoning, the runner-up
# candidates, and which already-blocked issues were skipped and why.
set -euo pipefail

ALLOWED_AUTHORS='["VforVitorio", "Santisoutoo"]'
EXCLUDED_LABELS='["epic", "agent:wip", "agent:blocked", "agent:infra-stuck", "area: ci-cd", "question", "wontfix", "duplicate", "invalid"]'

PICKER_MODEL="gpt-5.3-codex"

# Implementation (worker), general issues. Tier picked automatically by
# derive_model() from how many prior infra failures this issue already has
# (see infra_attempt_tier()) — tier 0 is the primary pick, 1/2 are the
# auto-escalation on repeat failure of the SAME issue. A plan (see the "Plan
# implementation" step in agent-loop.yml, gpt-5.3-codex, read-only) is always
# produced before this runs, so tier 0 doesn't need to be a frontier model —
# it only has to EXECUTE a plan someone else already reasoned through:
#   0) claude-sonnet-5-thinking-medium  Anthropic, mid-tier reasoning+cost
#   1) cursor-grok-4.6-high             xAI      — different vendor on retry
#   2) kimi-k3-max                      Moonshot — third vendor, last resort
MODEL_TOP=(claude-sonnet-5-thinking-medium cursor-grok-4.6-high kimi-k3-max)

# Implementation for area: docs — prose-heavy, cheapest tier. Same
# auto-escalation-by-tier scheme as MODEL_TOP, vendor-diversified:
#   0) gpt-5.4-mini            OpenAI
#   1) gemini-3.7-flash-high   Google
#   2) kimi-k2.7-code          Moonshot — code-capable, cheap, last resort
MODEL_DOCS=(gpt-5.4-mini gemini-3.7-flash-high kimi-k2.7-code)

# Implementation for area: tests — needs to read real code (asserts, mocks,
# edge cases), so the code-specialised cheap model goes first:
#   0) kimi-k2.7-code          Moonshot — code-capable, cheap
#   1) gpt-5.4-mini            OpenAI
#   2) gemini-3.7-flash-high   Google
MODEL_TESTS=(kimi-k2.7-code gpt-5.4-mini gemini-3.7-flash-high)

fetch_candidates() {
  gh issue list --state open --limit 200 \
    --json number,title,body,labels,author
}

# Author allowlist + excluded-label filter — the cheap, deterministic part.
# What used to also live here (a priority/bug/number sort picking the single
# winner) is now sort_candidates(), used only as the picker agent's fallback.
filter_candidates() {
  jq --argjson allowed "$ALLOWED_AUTHORS" --argjson excluded "$EXCLUDED_LABELS" '
    map(select(.author.login as $a | $allowed | index($a)))
    | map(select([.labels[].name] as $l | ($excluded | map(. as $e | $l | index($e)) | any) | not))'
}

sort_candidates() {
  jq '
    sort_by(
      ([.labels[].name] | if index("priority:high") then 0
                          elif index("priority:medium") then 1
                          elif index("priority:low") then 2
                          else 3 end),
      ([.labels[].name] | if index("bug") then 0 else 1 end),
      .number)'
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

# Enriches each filtered candidate with the context the picker agent needs to
# apply business judgment: retry tier (see infra_attempt_tier) and whether it
# already carries agent:failed (a real, non-infra failure). Bodies are capped
# at 1500 chars so the prompt stays a reasonable size.
annotate_candidates() {
  local enriched="[]"
  while IFS= read -r candidate; do
    local number tier has_failed
    number=$(echo "$candidate" | jq -r '.number')
    tier=$(infra_attempt_tier "$number")
    has_failed=$(echo "$candidate" | jq -r '[.labels[].name] | index("agent:failed") != null')
    enriched=$(jq -n --argjson acc "$enriched" --argjson c "$candidate" \
      --argjson tier "$tier" --argjson failed "$has_failed" \
      '$acc + [$c + {infra_tier: $tier, has_failed: $failed, body: ($c.body // "" | .[0:1500])}]')
  done < <(echo "$1" | jq -c '.[]')
  echo "$enriched"
}

# Runs the picker agent over the annotated candidates and returns its choice
# as JSON, or empty on any failure to produce a usable one — callers must
# treat empty as "fall back to the deterministic sort", never as an error.
run_picker() {
  local candidates="$1"
  {
    cat .github/agent/picker-prompt.md
    echo
    cat .github/agent/caveman-style.md
    echo
    echo "<candidates>"
    echo "$candidates"
    echo "</candidates>"
  } > "$RUNNER_TEMP/picker-prompt.txt"

  # Pure reasoning over already-fetched candidate text, no repo access —
  # short ceiling. IDLE just below CEILING: cursor-agent's default text
  # output doesn't stream, see run-engine.sh's header for why idle can't
  # trail ceiling without risking killing real (if slow) work.
  # tee'd to stderr (not redirected) so the picker's reasoning reaches the
  # Actions log — previously only the parsed `next_candidates` field
  # survived, as an issue comment, with no raw trace of the run itself.
  # >&2 on tee's own copy matters: this function's real return value is its
  # stdout, captured by the caller via $(run_picker ...) — piping the raw
  # engine output onto that same stdout would corrupt the captured value,
  # same reason run_review_attempt() in agent-loop.yml redirects its tee to
  # stderr too.
  set +e
  ENGINE_MODE=ask ENGINE_IDLE_TIMEOUT_SECONDS=280 ENGINE_HARD_CEILING_SECONDS=300 \
    bash .github/agent/run-engine.sh "cursor" "$PICKER_MODEL" "$RUNNER_TEMP/picker-prompt.txt" \
    2>&1 | tee "$RUNNER_TEMP/picker-output.txt" >&2
  set -e

  local line json chosen
  line=$(grep -oE 'PICKER_RESULT: \{.*\}' "$RUNNER_TEMP/picker-output.txt" | tail -1)
  if [ -z "$line" ]; then
    echo "Picker: no PICKER_RESULT line in output, falling back to deterministic sort." >&2
    return
  fi
  json="${line#PICKER_RESULT: }"
  if ! echo "$json" | jq -e . >/dev/null 2>&1; then
    echo "Picker: PICKER_RESULT line is not valid JSON, falling back to deterministic sort." >&2
    return
  fi
  chosen=$(echo "$json" | jq -r '.chosen // empty')
  if [ -z "$chosen" ] || ! echo "$candidates" | jq -e --argjson n "$chosen" 'any(.number == $n)' >/dev/null 2>&1; then
    echo "Picker: chosen issue is missing or not among the filtered candidates, falling back." >&2
    return
  fi
  echo "$json"
}

# Posts the picker's reasoning (or the fallback's own note) as a comment on
# the chosen issue, plus which already-blocked/infra-stuck issues never made
# it into the candidate pool — so "why this issue and not another" is always
# on the record, not just in the run's own transient log.
post_picker_comment() {
  local number="$1" picker_json="$2" skipped_blocked="$3"
  local body
  if [ -n "$picker_json" ]; then
    local reasoning next
    reasoning=$(echo "$picker_json" | jq -r '.reasoning // "(sin razonamiento)"')
    next=$(echo "$picker_json" | jq -r '
      (.next_candidates // [])
      | map("- #\(.number): \(.reasoning // "(sin razonamiento)")")
      | if length == 0 then "(ninguno)" else join("\n") end')
    body="Elegido por el picker del agent-loop ($PICKER_MODEL): $reasoning

Siguientes candidatos considerados:
$next"
  else
    body="Elegido por el picker del agent-loop: el agente no devolvió un resultado usable, se aplicó el orden determinista de siempre (prioridad → bug → número más antiguo)."
  fi
  if [ -n "$skipped_blocked" ]; then
    body="$body

Descartados por bloqueo previo (agent:blocked/agent:infra-stuck), no llegaron a candidatos: $skipped_blocked"
  fi
  gh issue comment "$number" --body "<!-- agent-picker --> $body" || true
}

# Selects one issue from the filtered candidate pool: tries the picker agent
# first, falls back to the deterministic sort if it doesn't return a usable
# choice. Sets PICKER_JSON as a side effect (empty on fallback) so main() can
# use it for the audit comment without re-running the picker.
PICKER_JSON=""
select_issue() {
  local filtered="$1"
  local count
  PICKER_JSON=""
  count=$(echo "$filtered" | jq 'length')
  if [ "$count" = "0" ]; then
    echo ""
    return
  fi
  if [ "$count" = "1" ]; then
    echo "$filtered" | jq -c '.[0]'
    return
  fi

  local annotated
  annotated=$(annotate_candidates "$filtered")
  PICKER_JSON=$(run_picker "$annotated")

  if [ -n "$PICKER_JSON" ]; then
    local chosen
    chosen=$(echo "$PICKER_JSON" | jq -r '.chosen')
    echo "$filtered" | jq -c --argjson n "$chosen" '.[] | select(.number == $n)'
  else
    echo "$filtered" | sort_candidates | jq -c '.[0]'
  fi
}

derive_branch_prefix() {
  local labels="$1"
  if echo "$labels" | jq -e 'index("bug")' >/dev/null; then echo "fix"
  elif echo "$labels" | jq -e 'index("area: docs")' >/dev/null; then echo "docs"
  else echo "feat"
  fi
}

derive_model() {
  local labels="$1" tier="$2"
  if echo "$labels" | jq -e 'index("area: tests")' >/dev/null; then
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
    # pass the same author/label filters — never a bypass. No picker call for
    # a single forced issue, there is nothing to choose between.
    issue=$(gh issue view "$FORCED_ISSUE" --json number,title,body,labels,author,state \
      | jq --argjson allowed "$ALLOWED_AUTHORS" --argjson excluded "$EXCLUDED_LABELS" '
          select(.state == "OPEN")
          | select(.author.login as $a | $allowed | index($a))
          | select([.labels[].name] as $l | ($excluded | map(. as $e | $l | index($e)) | any) | not)
          // empty')
  else
    local raw filtered skipped_blocked
    raw=$(fetch_candidates)
    filtered=$(echo "$raw" | filter_candidates)
    skipped_blocked=$(echo "$raw" | jq -r --argjson allowed "$ALLOWED_AUTHORS" '
      map(select(.author.login as $a | $allowed | index($a)))
      | map(select([.labels[].name] as $l | ($l | index("agent:blocked")) or ($l | index("agent:infra-stuck"))))
      | map("#\(.number)") | join(", ")')
    issue=$(select_issue "$filtered")
    if [[ -n "$issue" ]]; then
      post_picker_comment "$(echo "$issue" | jq -r '.number')" "$PICKER_JSON" "$skipped_blocked"
    fi
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

  local tier
  tier=$(infra_attempt_tier "$number")
  {
    echo "empty=false"
    echo "number=$number"
    echo "title=${title//$'\n'/ }"
    echo "branch_prefix=$(derive_branch_prefix "$labels")"
    echo "engine=cursor"
    echo "model=$(derive_model "$labels" "$tier")"
  } >> "$GITHUB_OUTPUT"
  if [ "$tier" != "0" ]; then
    echo "Model tier escalated to $tier (issue #$number has $tier prior infra failure(s))."
  fi
  echo "Picked #$number ($title)"
}

main "$@"
