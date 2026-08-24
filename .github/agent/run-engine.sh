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
set -euo pipefail

ENGINE="$1"
MODEL="$2"
PROMPT_FILE="$3"

case "$ENGINE" in
  opencode)
    opencode run --model "$MODEL" "$(cat "$PROMPT_FILE")"
    ;;
  cursor)
    # -p: non-interactive print mode; --force: skip the workspace-trust and
    # command-approval prompts (required headless).
    cursor-agent -p --force --model "$MODEL" "$(cat "$PROMPT_FILE")"
    ;;
  *)
    echo "::error::Unknown engine '$ENGINE'" >&2
    exit 1
    ;;
esac
