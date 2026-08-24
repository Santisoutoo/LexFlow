# Autonomous agent loop — runbook

The `agent-loop` workflow (`.github/workflows/agent-loop.yml`) picks one open
issue three times a day, implements it with an OpenCode worker (OpenCode Go
models), has a second agent review the diff, verifies the full CI surface,
opens a PR and arms auto-merge. Orca (desktop, on the maintainer's machine)
supervises: daily report, stuck-PR detector, watchdog (prompts under
`.github/agent/orca/`).

## Files

| File | Role |
|---|---|
| `worker-prompt.md` | System prompt for the implementer agent |
| `reviewer-prompt.md` | System prompt for the pre-PR reviewer agent |
| `pick-issue.sh` | Issue picker: author allowlist, label filters, engine+model routing |
| `run-engine.sh` | Engine dispatcher: runs the worker via OpenCode or Cursor CLI |
| `opencode.json` | OpenCode config for CI (no MCPs, headless permissions) |
| `orca/` | Prompts for the local Orca supervision automations |

## One-time setup (repo admin only)

1. **`AGENT_GH_PAT`** (Actions secret): fine-grained PAT restricted to this
   repo with Read+Write on **Contents, Pull requests, Issues** and NO
   Workflows scope (deliberate: the loop must be unable to rewrite itself,
   even under prompt injection). Note the expiry date below. The default
   `GITHUB_TOKEN` cannot be used: PRs it creates never trigger the required
   `pull_request` checks, so auto-merge would never fire.
2. **`OPENCODE_AUTH_JSON`** (Actions secret): base64 of an `auth.json`
   holding a valid OpenCode Go API key. Generate from a machine where
   `opencode` is logged in:

   ```bash
   base64 -w0 ~/.local/share/opencode/auth.json
   ```

   (PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\.local\share\opencode\auth.json"))`)
3. Run `scripts/setup-github.sh` (or `gh label create`) so the labels
   `agent-pr`, `agent:wip`, `agent:failed`, `agent:blocked` exist.
4. **`CURSOR_API_KEY`** (Actions secret, OPTIONAL): API key from the Cursor
   dashboard. With it: (a) `area: frontend` issues are implemented by the
   Cursor CLI (`composer-2.5`, Cursor's agent-native model — cheapest in the
   Pro plan's included "Cursor Models" pool) instead of OpenCode, and (b) the
   reviewer tries frontier judgment first (`gpt-5.3-codex`, then `gpt-5.6-sol`,
   both from Cursor's paid "Other Models" pool) before falling back to
   OpenCode's `kimi-k3`. Without the secret, every issue implements on
   OpenCode and the reviewer goes straight to `kimi-k3`.

## Model routing

Full fallback chains (2-3 models per task, cheapest-viable-first except where
judgment quality matters more than cost) are documented as comments next to
the constants in `pick-issue.sh` and in the Review step of
`agent-loop.yml`. Summary:

| Task | Primary | Fallback(s) | Rationale |
|---|---|---|---|
| Review (judgment/security) | `gpt-5.3-codex` (Cursor) | `gpt-5.6-sol` (Cursor) → `kimi-k3` (OpenCode) | Frontier reasoning first, "chino premium" as the guaranteed final attempt |
| Implementation (general) | `kimi-k3` (OpenCode) | `glm-5.2` → `qwen3.7-max` | Chinese OSS models, flagship-class |
| Implementation (`area: docs`) | `minimax-m3` (OpenCode) | `deepseek-v4-flash` → `mimo-v2.5` | Cheapest tier, prose-heavy work |
| Implementation (`area: tests`) | `minimax-m3` (OpenCode) | `glm-5.2` → `deepseek-v4-flash` | Cheap but escalates for logic-heavy tests |
| Implementation (`area: frontend`) | `composer-2.5` (Cursor) | `grok-4.5`/`grok-4.6` | Included pool, no draw on the paid allowance |

The Review cascade and the frontend fallback both draw from Cursor's same
$20/mo "Other Models" allowance when they escalate past the included pool —
if both escalate heavily in the same billing window they compete for it.
Several model ids above (Cursor's `gpt-5.3-codex`/`gpt-5.6-sol`, OpenCode's
`glm-5.2`/`qwen3.7-max`/`deepseek-v4-flash`/`mimo-v2.5`) were sourced from
web research in 2026-08 and are **not yet verified** against a live
`cursor-agent --list-models` / OpenCode catalog call — sanity-check with a
`workflow_dispatch` run on a low-stakes issue before trusting the 3x/day cron
on them.

Until both secrets exist the workflow runs but disarms itself at the first
step (no failures, no noise).

## Credential rotation

| Credential | Expires | Symptom when dead | Fix |
|---|---|---|---|
| `AGENT_GH_PAT` | PAT expiry date (max 1 year) | every run fails at the guard/claim step | regenerate PAT, update secret |
| `OPENCODE_AUTH_JSON` | Go subscription lapse / key rotation | `Error: Invalid API key.` in the implement step | re-login locally, regenerate base64, update secret |
| `CURSOR_API_KEY` | Cursor key revoked / sub lapse | auth error in cursor-engine implement steps | regenerate in the Cursor dashboard, update secret (loop still works via OpenCode fallback) |

## State machine (labels)

- `agent:wip` — claimed by a running job. Orphaned `wip` (no run in progress,
  no open PR) means a cancelled run; the Orca watchdog clears it.
- `agent:failed` — one failed attempt; the picker will retry it.
- `agent:blocked` — two failed attempts; the picker skips it until a human
  removes the label or closes the issue.
- `agent-pr` — on every loop PR. Only one may be open at a time (branch
  protection runs `strict:false`); a red agent PR therefore PAUSES the loop
  until it is closed or fixed — that is intentional fail-safe behaviour.

## Pause / resume

- Pause: `gh workflow disable agent-loop` (or delete the secrets).
- Resume: `gh workflow enable agent-loop`.
- One-shot manual run: `gh workflow run agent-loop -f issue=<N>` (the forced
  issue still passes the author/label safety filters).

## Manual rescue of `agent:blocked`

1. Open the repo in Orca (or a terminal), create a branch `fix/...`.
2. Run `opencode` interactively with `.github/agent/worker-prompt.md` as the
   opening prompt plus the issue text, or just fix it by hand.
3. Open a normal PR; remove `agent:blocked` (or let `closes #N` end it).

## Security model

- Only issues authored by the allowlist in `pick-issue.sh` are eligible —
  stranger-filed issues on this public repo never reach the worker.
- Issue bodies are passed to the agents as data with explicit
  ignore-embedded-instructions framing; issue comments are never passed.
- The checkout uses `persist-credentials: false`; the PAT exists only in the
  env of steps that talk to GitHub, never in the implement/verify steps.
- The PAT has no Workflows scope, so a push touching `.github/workflows/` is
  rejected by GitHub itself; `area: ci-cd` issues are excluded by the picker
  for the same reason.
