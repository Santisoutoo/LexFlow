#!/usr/bin/env bash
# Runs one cursor-agent pass in the selected mode.
#
# Usage: run-engine.sh <engine> <model> <prompt-file>
#   engine: "cursor" (only supported value — kept as a positional arg for
#           compatibility with callers that still pass it explicitly)
#
# Mode, via ENGINE_MODE (default "full"):
#   full — Implement / Review, trusted first-party code: `--force` (skips
#          both the workspace-trust prompt and per-command approval).
#   ask  — picker, planner, external-PR reviewer: pure read/analyze, never
#          write. `--mode ask --trust`, NEVER `--force`/`--yolo`. `--trust`
#          is required even here: verified locally (2026-08-28) that
#          `--mode ask` alone still blocks on the "Workspace Trust Required"
#          prompt in a non-interactive shell — only `--trust` (or `--force`,
#          which implies it) skips that gate.
#
# No `--sandbox enabled` (dropped 2026-08-28): the FIRST live CI run of the
# picker/planner (issue #112) failed the Plan implementation step in ~5s
# with zero captured output — consistent with the same "Sandbox mode ...
# not available" failure already seen locally on Windows, just an
# unconfirmed variant on the ubuntu-latest runner (GitHub-hosted runners
# often lack the namespace/seccomp privileges these sandboxes need). Not
# worth chasing further: `--mode ask` alone is the real, already-verified
# safety boundary (confirmed locally to stay read-only with no edit/bash
# tool available), `--sandbox` was defense-in-depth on top of it and never
# load-bearing.
#
# cursor-agent reads CURSOR_API_KEY from the environment.
#
# opencode was removed 2026-08-28: it kept failing without a diagnosable
# error, and Cursor already covered every code path opencode did. See
# CLAUDE.md §11 for the full lesson.
#
# Every invocation is bounded by an IDLE timeout, not a flat wall-clock one
# — in THEORY. On 2026-08-24 a cursor-agent review call (run 32749623046,
# issue #85) hung with zero output for 84 minutes and was only reaped when
# the job's 90-minute cap killed the whole run — neither engine had a
# call-level timeout at all. A first fix (PR #102) added a flat `timeout`,
# but on 2026-08-25 that killed a call still actively producing output on a
# wide-scope issue (#52): a flat wall-clock cap can't tell "hung" from
# "slow but working" IF the tool streams progress. It doesn't: verified
# locally (2026-08-28) that `cursor-agent -p` in the default text format
# prints NOTHING until the entire response is ready — a real Implement task
# took 666s (11 min) of total silence before printing one correct
# `AGENT_RESULT: DONE` line. So IDLE_TIMEOUT_SECONDS can't distinguish
# "hung" from "still thinking" for this tool the way it could for opencode;
# every caller must set it close to (not far below) HARD_CEILING_SECONDS, or
# a real task gets idle-killed before it can ever finish. The idle-loop
# below is left in place (harmless once idle >= ceiling — the external
# `timeout` always wins the race first) rather than ripped out, so genuine
# incremental-output detection comes back for free if a future change adds
# `--output-format stream-json --stream-partial-output` (real fix, needs
# rework of every AGENT_RESULT/VERDICT/PICKER_RESULT parser downstream —
# tracked as a known follow-up, not attempted here under time pressure).
#
# Intra-run quota fallback (2026-09-02): a 429/quota error on the primary
# model is not necessarily a dead end — Cursor-native models (Composer,
# Grok) draw from a separate quota pool than the routed third-party models
# (Claude/GPT/Gemini/Kimi) this loop defaults to, so one pool being
# exhausted doesn't mean the others are. When the optional
# ENGINE_QUOTA_FALLBACK_MODELS (comma-separated, consumed in full, capped
# at 3 total attempts including the primary) is set, a quota-shaped failure
# on one model retries against the next one in the list with fresh
# idle/ceiling timers, instead of failing the whole step immediately. Unset
# or empty = identical behavior to before this existed. The quota regex
# here is INTENTIONALLY duplicated in agent-loop.yml's Implement step: this
# copy decides whether to retry with a different model; that copy decides
# how to LABEL a failure that survived every retry here. An invalid API key
# is checked first and never triggers a retry — swapping models can't fix a
# bad credential, so that class of failure still fails on the first
# attempt, exactly as before.
set -euo pipefail

ENGINE="$1"
MODEL="$2"
PROMPT_FILE="$3"
# Defaults keep IDLE close to CEILING for the same reason every caller's
# explicit override does (see header) — a caller that forgets to override
# still gets a safe default instead of a foot-gun.
IDLE_TIMEOUT_SECONDS="${ENGINE_IDLE_TIMEOUT_SECONDS:-850}"
HARD_CEILING_SECONDS="${ENGINE_HARD_CEILING_SECONDS:-900}"

ENGINE_MODE="${ENGINE_MODE:-full}"

INVALID_KEY_STRING="Warning: The provided API key is invalid."
# Verified 2026-09-02 against real production failures (issue #13, runs
# 33524339447/33535919116/33565815236/33571651227/33579378288): Cursor's
# actual quota-exhaustion text is "ActionRequiredError: You've hit your
# usage limit ..." — NOT "429"/"rate limit"/plain "quota", which this regex
# originally only covered (and which is why those runs were mislabeled
# implement-infra-other instead of implement-quota-exhausted, and why the
# original version of this fallback would never have triggered on the very
# outage it was built to fix). Kept the generic terms too, since a future
# Cursor error format or a different upstream vendor's own 429 could still
# use them.
QUOTA_REGEX='429|rate.?limit|quota|insufficient.?(credit|balance)|usage.?limit|actionrequirederror'

# run_attempt: one bounded cursor-agent invocation against $1, writing raw
# output to $2. Mechanical extraction of the single-attempt body this
# script used to be — no per-attempt behavior change, only parametrized on
# model so the driver loop below can call it more than once.
run_attempt() {
  local model="$1" out_file="$2" cmd

  case "$ENGINE" in
    cursor)
      case "$ENGINE_MODE" in
        full)
          # -p: non-interactive print mode; --force: skip the workspace-trust
          # and command-approval prompts (required headless).
          cmd=(cursor-agent -p --force --model "$model" "$(cat "$PROMPT_FILE")")
          ;;
        ask)
          # Read-only: no --force/--yolo, ever. --trust only skips the
          # workspace-trust prompt (still required headless, see header); it
          # does not grant command-approval like --force does, and --mode ask
          # has no edit/bash tool to approve in the first place. No --sandbox
          # — see header.
          cmd=(cursor-agent -p --mode ask --trust --model "$model" "$(cat "$PROMPT_FILE")")
          ;;
        *)
          echo "::error::Unknown ENGINE_MODE '$ENGINE_MODE'" >&2
          exit 1
          ;;
      esac
      ;;
    *)
      echo "::error::Unknown engine '$ENGINE'" >&2
      exit 1
      ;;
  esac

  # -k 30: if TERM doesn't stop it within the hard ceiling, send KILL 30s
  # later — mirrors the orphan-process reap GitHub Actions does at its own
  # job-level timeout.
  timeout -k 30 "$HARD_CEILING_SECONDS" "${cmd[@]}" > "$out_file" 2>&1 &
  local runner_pid=$!

  # Relay output live so the caller's `tee` still sees it as it happens;
  # stops on its own once the runner exits.
  tail -n +1 -f "$out_file" --pid="$runner_pid" &
  local tail_pid=$!

  local last_size=0
  local last_change
  last_change=$(date +%s)
  local idle_killed=0
  while kill -0 "$runner_pid" 2>/dev/null; do
    sleep 5
    local cur_size
    cur_size=$(stat -c %s "$out_file" 2>/dev/null || echo 0)
    local now
    now=$(date +%s)
    if [ "$cur_size" -ne "$last_size" ]; then
      last_size=$cur_size
      last_change=$now
    elif [ $(( now - last_change )) -ge "$IDLE_TIMEOUT_SECONDS" ]; then
      echo "::error::Engine idle ${IDLE_TIMEOUT_SECONDS}s with no new output — killing" >&2
      kill -TERM "$runner_pid" 2>/dev/null || true
      pkill -TERM -P "$runner_pid" 2>/dev/null || true
      sleep 10
      kill -KILL "$runner_pid" 2>/dev/null || true
      pkill -KILL -P "$runner_pid" 2>/dev/null || true
      idle_killed=1
      break
    fi
  done

  # `|| rc=$?` instead of toggling `set -e`/`set +e`: this function can be
  # called from under an outer `set +e` (the driver loop below), and
  # re-enabling errexit in here — even briefly — would override that
  # outer state and trigger an immediate script exit on `return` with a
  # non-zero rc, before the caller ever gets to inspect it.
  local rc=0
  wait "$runner_pid" || rc=$?
  wait "$tail_pid" 2>/dev/null || true

  if [ "$idle_killed" -eq 1 ]; then
    # Distinct from `timeout`'s native 124 (hard-ceiling exit) so the caller
    # can tell an idle-kill apart from a hard-ceiling kill in its own logs.
    return 125
  fi
  return "$rc"
}

# Build the attempt list: primary model first, then each distinct fallback
# model in ENGINE_QUOTA_FALLBACK_MODELS order (skipping any already present
# — e.g. a primary already chosen as composer-2.5 by label/tier). Capped at
# 3 total attempts by construction: the fallback list is the caller's
# responsibility to keep short (documented in README.md), not enforced here.
models=("$MODEL")
if [ -n "${ENGINE_QUOTA_FALLBACK_MODELS:-}" ]; then
  IFS=',' read -ra fallback_models <<< "$ENGINE_QUOTA_FALLBACK_MODELS"
  for raw in "${fallback_models[@]}"; do
    fallback_model="$(echo "$raw" | xargs)"
    [ -z "$fallback_model" ] && continue
    already_present=false
    for existing in "${models[@]}"; do
      if [ "$existing" = "$fallback_model" ]; then
        already_present=true
        break
      fi
    done
    if [ "$already_present" = false ]; then
      models+=("$fallback_model")
    fi
  done
fi

out_file="$(mktemp)"
trap 'rm -f "$out_file"' EXIT

rc=1
attempt_num=0
total_attempts=${#models[@]}
for model in "${models[@]}"; do
  attempt_num=$((attempt_num + 1))

  rc=0
  run_attempt "$model" "$out_file" || rc=$?

  if [ "$rc" -eq 0 ]; then
    break
  fi

  if [ "$attempt_num" -ge "$total_attempts" ]; then
    break
  fi

  if grep -qF "$INVALID_KEY_STRING" "$out_file"; then
    # Never retry an invalid credential — a different model doesn't fix it,
    # and retrying would just burn the same failure against every fallback.
    break
  fi

  if ! grep -qiE "$QUOTA_REGEX" "$out_file"; then
    # Failure wasn't quota-shaped (hard-ceiling, idle-timeout, a genuine
    # error) — a different model wouldn't have helped, so propagate as
    # before rather than masking it behind an unrelated retry.
    break
  fi

  next_model="${models[$attempt_num]}"
  echo "::warning::Model '$model' hit a quota/rate-limit error — retrying with '$next_model' ($((attempt_num + 1))/${total_attempts})" >&2
done

if [ -n "${ENGINE_MODEL_USED_FILE:-}" ]; then
  echo "$model" > "$ENGINE_MODEL_USED_FILE"
fi

exit "$rc"
