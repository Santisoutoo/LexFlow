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
# Every invocation is bounded by an IDLE timeout, not a flat wall-clock one.
# On 2026-08-24 a cursor-agent review call (run 32749623046, issue #85) hung
# with zero output for 84 minutes and was only reaped when the job's
# 90-minute cap killed the whole run — neither engine had a call-level
# timeout at all. A first fix (PR #102) added a flat `timeout`, but on
# 2026-08-25 that killed a call still actively producing output on a
# wide-scope issue (#52): a flat wall-clock cap can't tell "hung" from
# "slow but working". So a call is only killed after IDLE_TIMEOUT_SECONDS
# with NO NEW bytes on stdout/stderr (catches a real hang fast, regardless
# of total duration), with HARD_CEILING_SECONDS as an absolute backstop for
# a call that dribbles output forever without ever finishing.
set -euo pipefail

ENGINE="$1"
MODEL="$2"
PROMPT_FILE="$3"
IDLE_TIMEOUT_SECONDS="${ENGINE_IDLE_TIMEOUT_SECONDS:-300}"
HARD_CEILING_SECONDS="${ENGINE_HARD_CEILING_SECONDS:-900}"

case "$ENGINE" in
  opencode)
    cmd=(opencode run --model "$MODEL" "$(cat "$PROMPT_FILE")")
    ;;
  cursor)
    # -p: non-interactive print mode; --force: skip the workspace-trust and
    # command-approval prompts (required headless).
    cmd=(cursor-agent -p --force --model "$MODEL" "$(cat "$PROMPT_FILE")")
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
