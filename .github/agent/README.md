# Autonomous agent loop — runbook

The `agent-loop` workflow (`.github/workflows/agent-loop.yml`) picks one open
issue three times a day on the healthy path — using an agent with business
judgment, not a blind sort — plans the implementation with a second read-only
agent, implements the plan with a Cursor CLI worker, has a fourth agent
review the diff, verifies the full CI surface, opens a PR and arms
auto-merge. A frequent low-cost poll cron on top of that retries sooner after
a transient failure instead of waiting for the next official slot — see
"Circuit breaker & retry gate" below. `orca-supervisor.yml`
(scheduled, once/day) mechanizes the deterministic parts of supervision:
clears orphaned `agent:wip`, reports (never auto-fixes) stuck/red `agent-pr`s,
and checks credential health. Orca (desktop, on the maintainer's machine,
prompts under `.github/agent/orca/`) remains for ad hoc investigation that
needs judgment — see "Supervision" below. `external-pr-review.yml` covers the
other entry point a public repo has — a PR opened directly from a fork, not
through an issue — with a read-only, tool-less advisory review; see "External
PR review" below.

Everything runs on the Cursor CLI (`cursor-agent`) — opencode was removed
2026-08-28 after it kept failing without a diagnosable error; see CLAUDE.md
§11 for the full lesson.

## Files

| File | Role |
|---|---|
| `picker-prompt.md` | System prompt for the issue-selection agent |
| `planner-prompt.md` | System prompt for the read-only implementation planner |
| `worker-prompt.md` | System prompt for the implementer agent |
| `reviewer-prompt.md` | System prompt for the pre-PR reviewer agent |
| `pick-issue.sh` | Issue picker: author allowlist, label filters, picker-agent call, model routing |
| `run-engine.sh` | Runs one `cursor-agent` pass, in `full` (trusted write) or `ask` (read-only) mode |
| `orca/` | Prompts for the local Orca supervision automations |
| `external-reviewer-prompt.md` | System prompt for the external-PR review bot (`external-pr-review.yml`) |

## One-time setup (repo admin only)

1. **`AGENT_GH_PAT`** (Actions secret): fine-grained PAT restricted to this
   repo with Read+Write on **Contents, Pull requests, Issues** and NO
   Workflows scope (deliberate: the loop must be unable to rewrite itself,
   even under prompt injection). Note the expiry date below. The default
   `GITHUB_TOKEN` cannot be used: PRs it creates never trigger the required
   `pull_request` checks, so auto-merge would never fire.
2. **`CURSOR_API_KEY`** (Actions secret, REQUIRED — the loop has no fallback
   engine): API key from the Cursor dashboard. Without it the Guard step
   disarms the whole loop at the first step (no failures, no noise), same as
   a missing `AGENT_GH_PAT`.
3. Run `scripts/setup-github.sh` (or `gh label create`) so the labels
   `agent-pr`, `agent:wip`, `agent:failed`, `agent:blocked`,
   `agent:infra-stuck`, `external-contribution` exist.

## Issue selection

`pick-issue.sh` filters candidates deterministically (allowlisted author, no
excluded label — `agent:blocked`/`agent:infra-stuck` issues never even reach
the picker) and then hands the survivors to a picker agent
(`picker-prompt.md`, `gpt-5.3-codex`, read-only `--mode ask`) instead of a
blind priority/bug/number sort. The picker weighs declared dependencies
between issues, retry history, priority/bug labels, and stated urgency — see
`picker-prompt.md` for the full rubric. If it doesn't return a usable choice
(no parseable `PICKER_RESULT:` line, or a `chosen` number outside the
filtered candidates), `pick-issue.sh` falls back to the old deterministic
sort — the picker is never a new single point of failure for the whole loop.
Either way, the choice is written as a `<!-- agent-picker -->` comment on the
picked issue: reasoning, the runner-up candidates it considered next, and
which already-blocked issues were skipped and why.

## Implementation planning

Before the worker writes any code, a separate read-only agent
(`planner-prompt.md`, `gpt-5.3-codex`, `--mode ask`) reads the issue and the
already-checked-out repo and writes an implementation plan — files to touch,
existing patterns to reuse, edge cases to cover. That plan is injected into
the worker's prompt as "Plan de implementación a seguir". This is why
Implementation below can run on a mid-tier model instead of a frontier one:
the expensive reasoning about *approach* already happened; the worker mostly
has to *execute* it. A failed or empty plan is a soft failure — Implement
proceeds without one, reasoning from the issue directly, same as before this
existed.

## Model routing

Full fallback chains (2-3 models per task, cheapest-viable-first except where
judgment quality matters more than cost) are documented as comments next to
the constants in `pick-issue.sh` and in the Review step of
`agent-loop.yml`. Summary — every task now runs on Cursor, each tier
deliberately diversified across upstream vendors so one provider's outage
doesn't take out a whole fallback chain:

| Task | Primary (tier 0) | Fallback(s) (tier 1 / 2) | Rationale |
|---|---|---|---|
| Issue picking | `gpt-5.3-codex` | — (falls back to deterministic sort, not another model) | Single call per cycle, judgment over cost |
| Implementation planning | `gpt-5.3-codex` | — (Implement proceeds without a plan) | Single call per cycle, judgment over cost |
| Review (judgment/security) | `gpt-5.3-codex` | `gpt-5.6-sol` → `kimi-k3-max` | Frontier reasoning first (OpenAI), Moonshot as the guaranteed final attempt |
| Implementation (general) | `claude-sonnet-5-thinking-medium` | `cursor-grok-4.6-high` → `kimi-k3-max` | Mid-tier is enough — it EXECUTES a plan someone else already reasoned through |
| Implementation (`area: docs`) | `gpt-5.4-mini` | `gemini-3.7-flash-high` → `kimi-k2.7-code` | Cheapest tier, prose-heavy work |
| Implementation (`area: tests`) | `kimi-k2.7-code` | `gpt-5.4-mini` → `gemini-3.7-flash-high` | Code-specialised cheap model first |

**Implementation fallback auto-escalates** (since 2026-08-26): `derive_model()`
in `pick-issue.sh` counts how many `<!-- agent-infra -->` comments the picked
issue already has (0/1/2) and indexes straight into the tier for that count —
no manual swap needed. A 3rd infra failure gets the issue `agent:infra-stuck`
and excluded from the picker before a 4th attempt would ever happen, so tier 2
is the ceiling. The Review cascade already auto-escalates on its own (tries
each model in sequence, gated on whether a `VERDICT:` line parsed).

Model ids above were confirmed against a live `cursor-agent --list-models`
call in this session (2026-08-28) — the earlier caveat about unverified
OpenCode-sourced ids no longer applies, since opencode is gone. Still worth a
`workflow_dispatch` sanity run on a low-stakes issue after any model-table
change, same practice as before.

Until both secrets exist the workflow runs but disarms itself at the first
step (no failures, no noise).

## Timeouts

Every `cursor-agent` call in `run-engine.sh` is bounded by `IDLE_TIMEOUT_SECONDS`
and `HARD_CEILING_SECONDS` — but as of 2026-08-28 `IDLE` is set just below
`CEILING` everywhere, not a real "no new output" window. Verified against a
live run (issue #112): `cursor-agent -p` in the default text output format
prints **nothing until the entire response is ready** — a real Implement
call sat silent for 666s before printing one correct line. That's the
opposite of opencode's behaviour, which the original idle-detection design
(PR #102) was built around. A short idle window now just kills real work
before it can finish, so every caller sizes `IDLE` close to `CEILING`
instead, making the external `timeout` wrapper the sole practical safety
net. Genuine incremental-hang detection would need `--output-format
stream-json --stream-partial-output`, which requires reworking every
`AGENT_RESULT`/`VERDICT`/`PICKER_RESULT` parser downstream — a known,
not-yet-done follow-up (see `run-engine.sh`'s header for the full story).

## Observability

As of 2026-08-29, Pick issue and Plan implementation `tee` their output
instead of redirecting it to a file only — both now reach the Actions log,
same as Implement and Review already did. Free-text narration (picker
`reasoning`, worker's post-`AGENT_RESULT` summary, reviewer FIX lists and
non-blocking notes, external reviewer's rationale) defaults to the terse
style in `.github/agent/caveman-style.md`, concatenated into each of those
prompts — fewer tokens, easier to scan a run after the fact. The Planner's
plan body is exempt and stays normal prose: it's a technical deliverable the
Worker depends on, not narration. This is post-hoc inspectability only —
per the Timeouts section above, `cursor-agent -p` doesn't stream, so a
step's full output still appears in one shot when the call finishes, not
live.

## Circuit breaker & retry gate

With a single engine there is nowhere left to escalate to on a failure
streak — the "Circuit breaker" step in `agent-loop.yml`, run before Pick
issue, checks whether the last 3 real attempts all concluded `failure` (via
`gh run list`, a proxy signal — it can't see infra-vs-attempt failure, only
overall conclusion). If so, it skips this run rather than burning a 4th
attempt against a possibly-exhausted Cursor quota; the skipped run itself
concludes success/skip, which correctly resets the streak next cycle.

Separately, the Implement step best-effort greps the worker's captured
output for `429`/`rate limit`/`quota`/`insufficient credit` text and tags the
failure `implement-quota-exhausted` instead of a generic infra reason when
matched — a heuristic (a model could print those words in unrelated prose),
but a faster, more specific signal than waiting for 3 generic infra fails.
The `<!-- agent-infra -->` comment also records `engine=`/`model=` for
traceability.

On top of the 3 official slots (06:00, 13:00, 20:00 UTC), a second cron entry
(`15,45 * * * *`, every 30min, offset from the official `:00` minute so the
two never collide) fires a lightweight "poll tick." A new "Retry gate" step
(run right after Guard, before Install Cursor CLI and the Circuit breaker)
lets a poll tick fall through to a real attempt ONLY if the most recent
*substantive* run (excluding this one and excluding prior no-op poll ticks)
concluded `failure` and at least 1h has passed since it finished; otherwise
it self-cancels (`gh run cancel`) so the run concludes `cancelled`, not
`success` — that distinct conclusion is what lets both the retry gate's own
lookup and the Circuit breaker's "last 3 runs" query correctly skip past
no-op ticks instead of being diluted by them (`--limit 50`, not 5, since up
to ~46 poll ticks can sit between two real attempts). Official 06/13/20 UTC
slots and `workflow_dispatch` runs are never gated by this — they always
proceed exactly as before. Net effect: a transient/infra failure (timeout,
crash, one-off flake) now waits roughly 60-90 minutes for a retry instead of
up to ~10 hours for the next official slot, at near-zero cost in the healthy
case (a no-op poll tick self-cancels in well under a minute).

Backoff is uniform (1h) regardless of failure reason for now — a
`implement-quota-exhausted` failure could reasonably warrant a longer
backoff than a one-off timeout, since retrying immediately against an
exhausted quota is unlikely to succeed, but that reason is currently only
recorded per-issue (in the `<!-- agent-infra -->` comment), not per-run,
so the retry gate has no cheap way to read it before picking an issue. A
documented follow-up: have Cleanup also persist the reason as a repo
variable (e.g. `gh variable set LAST_FAILURE_REASON`), so the retry gate can
read it back cheaply and apply a longer backoff specifically for quota
exhaustion. Not yet implemented — v1 ships with the uniform backoff, and a
genuinely exhausted quota still gets caught by the same Circuit breaker,
just faster (failures now accumulate in ~1h cycles instead of ~7-10h ones).

## Credential rotation

| Credential | Expires | Symptom when dead | Fix |
|---|---|---|---|
| `AGENT_GH_PAT` | PAT expiry date (max 1 year) | every run fails at the guard/claim step | regenerate PAT, update secret |
| `CURSOR_API_KEY` | Cursor key revoked / sub lapse | "Warning: The provided API key is invalid." in any cursor-agent step (verified string, 2026-08-28) | regenerate in the Cursor dashboard, update secret — the loop has no fallback engine, so this disarms it entirely |

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

## External PR review

The allowlist in `pick-issue.sh` only protects the issue side — someone
outside it can still open a PR directly from a fork. `external-pr-review.yml`
(triggered on `pull_request_target: opened/synchronize/reopened`) reviews
those: it reads the diff with `cursor-agent` run in locked-down read-only
mode (`ENGINE_MODE=ask` in `run-engine.sh` — `--mode ask --trust`, never
`--force`/`--yolo`, so there is no edit/bash tool to call even under a
successful prompt injection) and posts an advisory comment
(edited in place on new pushes, never duplicated) with a `RECOMMEND_MERGE` /
`NEEDS_CHANGES` / `DO_NOT_MERGE` verdict.

It **never** approves as a formal GitHub review and **never** auto-merges —
a human always decides. It also never checks out or executes the PR's own
code (the checkout step stays on the base branch; the diff is fetched as
text via the API), and the LLM-calling step never has a write-capable token
in its env — only the separate comment-posting step does, after the LLM's
output is already captured to a file. Skips silently for: the two
allowlisted authors, bot authors (Dependabot etc.), the loop's own
`agent-pr`s, drafts, and diffs bigger than 1500 lines / 50 files (comments
"too large for automated review" instead of spending a call on it).

Since `pull_request_target` workflows only run the version already on the
base branch, this one can't be tested from the PR that introduces it — use
`gh workflow run external-pr-review -f pr_number=<N>` against an already-open
external PR to dry-run it manually.

## Pause / resume

- Pause: `gh workflow disable agent-loop` (or delete the secrets). This
  disables BOTH `schedule` entries at once — the official 3x/day slots and
  the 30min poll tick — there is no way to pause only one without editing
  `on.schedule` in the YAML.
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
2. Run `cursor-agent` interactively with `.github/agent/worker-prompt.md` as
   the opening prompt plus the issue text, or just fix it by hand.
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
- Direct PRs from a fork (not routed through an issue) are covered
  separately by `external-pr-review.yml` — see "External PR review" above.
  It never checks out or executes the PR's own code, never has a
  write-capable token in the same step as the LLM call, and it runs
  `cursor-agent` in read-only `--mode ask` (never `--force`/`--yolo`) so
  there is no tool the model could call even under a successful injection.
