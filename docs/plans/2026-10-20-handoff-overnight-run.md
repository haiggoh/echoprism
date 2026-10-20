# Handoff — overnight autonomous run, 1d onward

_Written 2026-10-20 17:50 UTC by the Opus gateway session that resumed the killed GLM run. Read
this file first, then `docs/plans/2026-10-19-release-roadmap.md`._

## Why this handoff exists

The previous free session (NVIDIA GLM 5.3 Flash thinking, transcript `f95f65a2`) ran 1b and 1c
autonomously and died at 00:42 UTC on 2026-10-20. It did not fail on its own: another session ran
`free-agents/bin/remote-session.sh --stop`, which killed its proxy, and the port was reused for
Mistral. Nothing was lost. An Opus session then closed out 1c (below). You continue from there.

## State at handoff (all on `master`, nothing pushed)

- `b2fcaf2c` 1c feature: iTunes search, real subscriptions, refresh.
- `a7fe9a1d` 1c review fixes: episode de-dup scoped per channel (guids are only unique per feed);
  `due_podcast_feeds` compares `datetime(last_fetched_at)` (the app writes RFC 3339, whose `T` sorted
  after SQLite's space). Two regression tests, both red before the fix.
- `0c9bdc43` roadmap: 1c delivered, next action 1d.
- Gates at handoff: cargo 29/29 lib + 3 live `#[ignore]` smoke; vitest 116/116; tsc clean;
  Playwright 8/8. Working tree is clean except `node_modules/.package-lock.json` (npm noise, do not
  commit it).
- Deferred to 1e from the 1c review: `refresh_due_feeds` fetches due feeds one at a time.

## The goal (set this with /jgoal at session start, verbatim)

Get the EchoPrism repo (~/ClaudeWorkspace/echoprism) to first-release readiness per
docs/plans/2026-10-19-release-roadmap.md: finish step 1 (1d smart links on real data → 1e
hardening), step 2 (2a-2c; 2d as far as sensible), step 4 (4a-4e) as far as possible without an
Apple/paid signing identity, and prepare the delivery routes (build-from-source installer, Homebrew
formula, GitHub Releases workflow) — everything prepared to ship, nothing pushed/tagged/published.

## Owner's standing rules for this run (from 2026-10-19, still in force)

1. **Autonomous.** Keep going through the steps without stopping between them; use
   /run-to-completion. Ask only what truly cannot be decided with pros and cons; otherwise decide and
   record the decision in the plan doc.
2. **Commit every milestone**, staged BY PATH (never `git add -A`), with the trailer for the model you
   are actually running as (check memory `commit-attribution-by-model`). **Never push, tag or
   publish.**
3. **Bug-check everything you create:** TDD (RED for the right reason → GREEN), regularly run
   /check-code, and a contract mutation check where a frontend↔backend contract changes.
4. **Every milestone gets an adversarial review before or right after its commit**, dispatched with
   `~/ClaudeWorkspace/free-agents/bin/remote-agent-dispatch.py --provider gemini --model
   gemini-3.8-flash --allow-remote-files --files <patch> ...` (key in `~/.api_keys/gemini`). Triage
   every finding against the real code; earlier reviews hallucinated file names and refuted ~half
   their findings. Keep each finding to ≤4 lines in the prompt: output has been truncated near 2 KB.
5. **This is a free session**, so subagents and offloading are for QUALITY (review, bug-hunting,
   ideas, hard problems), never to save cost on easy work. Do not avoid offloading because the work
   is hard.
6. **Gemini 4 / Pro are NOT available free** (probed 2026-10-20: `gemini-4-argon` and
   `gemini-3.1-pro-preview` return `limit: 0` on the free key, a fixed zero). Use 3.8 Flash. The
   Gemini quota renews just after 00:00 UTC.
7. Each milestone: one plan doc in `docs/plans/` (same shape as the 1b/1c plans), receipts per phase,
   then a delivery note in the roadmap's "Where things stand" plus an updated "Next action".
8. **Never run `remote-session.sh --stop`, never start another `remote-session.sh` session, and never
   kill anything listening on ports 4141-4151:** one of them is the proxy you are running on.

## Next action

Step 1d — smart links on real data: check the video-to-podcast pairing and the per-title play
mode (video or audio by default) against Vergecast, Some More News / Even More News and Power
User, now that search (1b) and podcast subscriptions (1c) produce real rows. Then 1e (warnings
~25, the flaky test, sequential refresh, removing the unused `multipart`/`atom_syndication`/`axum`
dependencies), then step 2, step 4 and the delivery routes.
