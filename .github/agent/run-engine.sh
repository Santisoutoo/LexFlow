#!/usr/bin/env bash
# Runs one implementation pass with the selected engine.
#
# Usage: run-engine.sh <engine> <model> <prompt-file>
#   engine: "opencode" | "cursor"
#
# Both engines receive the same worker prompt and honour the same finish
# protocol (AGENT_RESULT markers), so the surrounding workflow parses their
# output identically. Auth: opencode reads auth.json from XDG_DATA_HOME;
# cursor-agent reads CURSOR_API_KEY from the environment.
#
# Every invocation is bounded by ENGINE_TIMEOUT_SECONDS (default 900s): on
# 2026-08-24 a cursor-agent review call (run 32749623046, issue #85) hung
# with zero output for 84 minutes and was only reaped when the job's
# 90-minute cap killed the whole run. Neither engine had a call-level
# timeout, so one hung call silently burned the entire job budget instead
# of failing fast into the caller's infra-failure / model-fallback path.
set -euo pipefail

ENGINE="$1"
MODEL="$2"
PROMPT_FILE="$3"
TIMEOUT_SECONDS="${ENGINE_TIMEOUT_SECONDS:-900}"

case "$ENGINE" in
  opencode)
    # -k 30: if TERM doesn't stop it within 30s, send KILL — mirrors the
    # orphan-process reap GitHub Actions had to do at the job-level timeout.
    timeout -k 30 "$TIMEOUT_SECONDS" opencode run --model "$MODEL" "$(cat "$PROMPT_FILE")"
    ;;
  cursor)
    # -p: non-interactive print mode; --force: skip the workspace-trust and
    # command-approval prompts (required headless).
    timeout -k 30 "$TIMEOUT_SECONDS" cursor-agent -p --force --model "$MODEL" "$(cat "$PROMPT_FILE")"
    ;;
  *)
    echo "::error::Unknown engine '$ENGINE'" >&2
    exit 1
    ;;
esac
