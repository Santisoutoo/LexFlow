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

case "$ENGINE" in
  cursor)
    case "$ENGINE_MODE" in
      full)
        # -p: non-interactive print mode; --force: skip the workspace-trust
        # and command-approval prompts (required headless).
        cmd=(cursor-agent -p --force --model "$MODEL" "$(cat "$PROMPT_FILE")")
        ;;
      ask)
        # Read-only: no --force/--yolo, ever. --trust only skips the
        # workspace-trust prompt (still required headless, see header); it
        # does not grant command-approval like --force does, and --mode ask
        # has no edit/bash tool to approve in the first place. No --sandbox
        # — see header.
        cmd=(cursor-agent -p --mode ask --trust --model "$MODEL" "$(cat "$PROMPT_FILE")")
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

out_file="$(mktemp)"
trap 'rm -f "$out_file"' EXIT

# -k 30: if TERM doesn't stop it within the hard ceiling, send KILL 30s
# later — mirrors the orphan-process reap GitHub Actions does at its own
# job-level timeout.
timeout -k 30 "$HARD_CEILING_SECONDS" "${cmd[@]}" > "$out_file" 2>&1 &
runner_pid=$!

# Relay output live so the caller's `tee` still sees it as it happens;
# stops on its own once the runner exits.
tail -n +1 -f "$out_file" --pid="$runner_pid" &
tail_pid=$!

last_size=0
last_change=$(date +%s)
idle_killed=0
while kill -0 "$runner_pid" 2>/dev/null; do
  sleep 5
  cur_size=$(stat -c %s "$out_file" 2>/dev/null || echo 0)
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

set +e
wait "$runner_pid"
rc=$?
set -e
wait "$tail_pid" 2>/dev/null || true

if [ "$idle_killed" -eq 1 ]; then
  # Distinct from `timeout`'s native 124 (hard-ceiling exit) so the caller
  # can tell an idle-kill apart from a hard-ceiling kill in its own logs.
  exit 125
fi
exit "$rc"
