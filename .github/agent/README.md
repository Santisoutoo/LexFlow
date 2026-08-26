# Autonomous agent loop — runbook

The `agent-loop` workflow (`.github/workflows/agent-loop.yml`) picks one open
issue three times a day, implements it with an OpenCode worker (OpenCode Go
models), has a second agent review the diff, verifies the full CI surface,
opens a PR and arms auto-merge. `orca-supervisor.yml` (scheduled, once/day)
mechanizes the deterministic parts of supervision: clears orphaned
`agent:wip`, reports (never auto-fixes) stuck/red `agent-pr`s, and checks
credential health. Orca (desktop, on the maintainer's machine, prompts under
`.github/agent/orca/`) remains for ad hoc investigation that needs judgment —
see "Supervision" below.

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
   `agent-pr`, `agent:wip`, `agent:failed`, `agent:blocked`,
   `agent:infra-stuck` exist.
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

| Task | Primary (tier 0) | Fallback(s) (tier 1 / 2) | Rationale |
|---|---|---|---|
| Review (judgment/security) | `gpt-5.3-codex` (Cursor) | `gpt-5.6-sol` (Cursor) → `kimi-k3` (OpenCode) | Frontier reasoning first, "chino premium" as the guaranteed final attempt |
| Implementation (general) | `kimi-k3` (OpenCode) | `glm-5.2` → `qwen3.7-max` | Chinese OSS models, flagship-class |
| Implementation (`area: docs`) | `minimax-m3` (OpenCode) | `deepseek-v4-flash` → `mimo-v2.5` | Cheapest tier, prose-heavy work |
| Implementation (`area: tests`) | `minimax-m3` (OpenCode) | `glm-5.2` → `deepseek-v4-flash` | Cheap but escalates for logic-heavy tests |
| Implementation (`area: frontend`) | `composer-2.5` (Cursor) | `grok-4.5` → `grok-4.6` | Included pool, no draw on the paid allowance |

**Implementation fallback auto-escalates** (since 2026-08-26): `derive_model()`
in `pick-issue.sh` counts how many `<!-- agent-infra -->` comments the picked
issue already has (0/1/2) and indexes straight into the tier for that count —
no manual swap needed. A 3rd infra failure gets the issue `agent:infra-stuck`
and excluded from the picker before a 4th attempt would ever happen, so tier 2
is the ceiling. The Review cascade already auto-escalates on its own (tries
each model in sequence, gated on whether a `VERDICT:` line parsed).

The Review cascade and the frontend fallback both draw from Cursor's same
$20/mo "Other Models" allowance when they escalate past the included pool —
if both escalate heavily in the same billing window they compete for it.
Several model ids above (Cursor's `gpt-5.3-codex`/`gpt-5.6-sol`, OpenCode's
`glm-5.2`/`qwen3.7-max`/`deepseek-v4-flash`/`mimo-v2.5`) were sourced from
web research in 2026-08 and are **not yet verified** against a live
`cursor-agent --list-models` / OpenCode catalog call — sanity-check with a
`workflow_dispatch` run on a low-stakes issue before trusting the 3x/day cron
on them, and especially before relying on the tier-1/2 auto-escalation above.

Until both secrets exist the workflow runs but disarms itself at the first
step (no failures, no noise).

## Circuit breaker

All `opencode-go/*` models share **one pooled budget** ($12/5h — see the
`timeout-minutes: 90` comment in `agent-loop.yml`), so rotating tiers within
that namespace doesn't protect against the pool itself running dry — only
crossing to Cursor (a genuinely separate budget) does. The "Circuit breaker"
step in `agent-loop.yml`, run before Pick issue, checks whether the last 3
completed runs all concluded `failure` (via `gh run list`, a proxy signal —
it can't see which engine a run used, only its overall conclusion). If so:

- Cursor configured → force `engine=cursor` for this run, regardless of the
  issue's area label.
- Cursor not configured → skip the run entirely rather than burn a 4th
  attempt against a possibly-exhausted opencode pool. The skipped run itself
  concludes success/skip, which correctly resets the streak next cycle.

Separately, the Implement step best-effort greps the worker's captured
output for `429`/`rate limit`/`quota`/`insufficient credit` text and tags the
failure `implement-quota-exhausted` instead of a generic infra reason when
matched — a heuristic (a model could print those words in unrelated prose),
but a faster, more specific signal than waiting for 3 generic infra fails.
The `<!-- agent-infra -->` comment also now records `engine=`/`model=`, since
`gh run list` can't reconstruct per-engine failure history on its own.

## Credential rotation

| Credential | Expires | Symptom when dead | Fix |
|---|---|---|---|
| `AGENT_GH_PAT` | PAT expiry date (max 1 year) | every run fails at the guard/claim step | regenerate PAT, update secret |
| `OPENCODE_AUTH_JSON` | Go subscription lapse / key rotation | `Error: Invalid API key.` in the implement step | re-login locally, regenerate base64, update secret |
| `CURSOR_API_KEY` | Cursor key revoked / sub lapse | auth error in cursor-engine implement steps | regenerate in the Cursor dashboard, update secret (loop still works via OpenCode fallback) |

## State machine (labels)

- `agent:wip` — claimed by a running job. Orphaned `wip` (no run in progress,
  no open PR) means a cancelled run; `orca-supervisor.yml` clears it daily
  (it double-checks no agent-loop run is genuinely `in_progress` first, so it
  never rips a label off a live claim).
- `agent:failed` — one failed *real* attempt (BLOCKED verdict, verify red,
  review cascade exhausted, push/PR failure); the picker will retry it.
- `agent:blocked` — two failed real attempts; the picker skips it until a
  human removes the label or closes the issue.
- `agent:infra-stuck` — three consecutive infra failures (engine crash,
  idle/hard-ceiling timeout, no `AGENT_RESULT` marker, DONE-but-empty-diff).
  Infra failures never count toward `agent:failed`/`agent:blocked` — they
  are logged as `<!-- agent-infra -->` issue comments and escalate on their
  own counter, so an issue that reliably times out doesn't retry forever,
  3x/day, with no human ever finding out. The picker skips it until a human
  removes the label (usually after splitting the issue into a narrower one).
- `agent-pr` — on every loop PR. Only one may be open at a time (branch
  protection runs `strict:false`); a red agent PR therefore PAUSES the loop
  until it is closed or fixed — that is intentional fail-safe behaviour.

## Supervision

`orca-supervisor.yml` (`.github/workflows/orca-supervisor.yml`, cron 1x/day,
30 min after the loop's last daily slot) mechanizes what doesn't need
judgment: clears orphaned `agent:wip` (see State machine above), a
credential-health heuristic against the last failing run's log, and a
deduped comment on stuck/red `agent-pr`s — it reports, never auto-reruns or
auto-closes. It writes a job summary every run.

Local Orca (`.github/agent/orca/*.md`) is still worth reaching for when a
situation needs actual judgment: is a red check flaky or real (the
stuck-pr-prompt's call), or a deeper credential/health diagnosis than the
mechanical heuristic gives. Always run it from a dedicated worktree, never
the primary checkout — see "Manual rescue" below for the exact commands.

## Pause / resume

- Pause: `gh workflow disable agent-loop` (or delete the secrets).
- Resume: `gh workflow enable agent-loop`.
- One-shot manual run: `gh workflow run agent-loop -f issue=<N>` (the forced
  issue still passes the author/label safety filters).

## Manual rescue of `agent:blocked`

Always in a **dedicated worktree**, never in the maintainer's primary
checkout — a local Orca/rescue session and a human editing the same repo at
the same time is exactly the uncommitted-work collision the worktree lesson
in `CLAUDE.md` (2026-06-06) warns about.

1. `git worktree add ../LexFlow-orca -b fix/... main` (or `cd ../LexFlow-orca`
   if it already exists), then `npm install --prefix frontend --no-fund
   --no-audit` (worktrees don't share `node_modules`, same lesson).
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
