# Handoff — browser-fast playback start (echoprism)

## 1. Why this exists
A paid planning session (Claude Opus 5.5, 2026-11-15) measured the slow start, ran the design
with the owner, and wrote the plan. Execution is handed to a free session so the long
implement → test → ship loop runs at $0. Nothing has been implemented yet.

## 2. State (verified by the planning session)
- `691d926f` — design: `docs/plans/2026-11-15-streaming-startup-design.md` (owner-approved).
- `597b9f91` — plan: `docs/plans/2026-11-15-streaming-startup-plan.md` (12 tasks + Phase 0).
- `master` clean at `597b9f91` before this handoff commit. Latest released version `v0.1.19`
  (re-check tags in Phase 0 — another session may have shipped since).
- No worktree `~/.wt/ep-startup` exists yet; Phase 0 creates it.
- Waypoint `echoprism-audio-only-checkbox` is a WATCH item, not part of this work.

## 3. Goal (owner, verbatim excerpts, 2026-11-15)
> "The goal is to have YouTube videos essentially start playing as quickly as when loading them
> in a browser with an app blocker such as Brave or Safari with a ad blocker plug-in. I don't want
> it to be significantly slower than that I want the same performance as a web browser An audio
> only mode should be even more responsive and useless data since the video stream wouldn't need
> to be loaded at all."

> "ship through release approved /autopilot run on echoprism in the new session you'll launch.
> the session may and should also use offloading to verify milestones according to the planbook"

All owner decisions (pre-resolve triggers, caps 720p windowed / 4K fullscreen, tracker stripping
with fallback, hard ≤ 5 s cold target, metered restore semantics) are in the design doc.

## 4. Standing rules (adopt for the whole session)
1. Autonomous: decide and record instead of asking; stop only for forks that cannot be weighed.
   Items the plan marks REPORT BACK / owner trade-off become waypoints; continue with the rest.
2. Work only in the worktree `~/.wt/ep-startup` (branch `feat/startup-speed`). NEVER switch the
   branch of `~/ClaudeWorkspace/echoprism` — the dev launcher runs that checkout as-is.
3. Commit every milestone, staged **by path** (never `git add -A`), with the running model's
   co-author trailer from memory `commit-attribution-by-model` (read it before EVERY commit).
4. **Shipping authority: through RELEASE (owner, 2026-11-15)** — push, merge to `master`, version
   bump, tag, GitHub release, refresh, dogfood — only via the plan's Task 12 gate and
   `rtc-ship.sh` run against the WORKTREE. Never force-push, never move or delete a published
   tag, never rewrite `master`: fix forward as the next version.
5. TDD every change (fails for the right reason, then passes); every important behaviour gets the
   plan's discriminant (known-bad turns it red); never weaken a test to get green.
6. Verify each milestone with an independent offload (plan rule 8): a stateless dispatch via
   `free-agent-tool.py` (role validator; cross-family from the model you run as), or a headless
   free session when the check must run commands. Check every finding against the real code —
   reviewers hallucinate file names. Record `model_used` + route in the receipt.
7. Network timings on this machine MUST force IPv4 (`curl -4`, `yt-dlp --force-ipv4`).
8. Resolve model and roster facts when you need them, from the catalog, never from memory.
9. Never run `remote-session.sh --stop`, never kill anything listening on 4141–4151 (one is the
   proxy you run on). Headless free sessions for verification are allowed (rule 6); never launch
   an INTERACTIVE successor or hand this work onward — you ARE the successor.
10. Never write the live app data under `~/Library/Application Support/app.echoprism/` (read it
    only with `sqlite3 -readonly`). Never print process argv, keys or tokens.
11. Record progress in §6 below at EVERY receipt, committed with that task's commit.

## 5. Next action
Invoke the `run-to-completion:autopilot` skill (the owner's "/autopilot") with this plan as the
queue: `docs/plans/2026-11-15-streaming-startup-plan.md`. Execute it NATIVE per its header
(superpowers:executing-plans), starting at **Phase 0**: three strategy sentences, then the
read-only preflight and Receipt 0. Proceed through Tasks 1–12 without stopping between them.

## 6. Progress log (append one line per receipt: date · task · commit · result)
- 2026-11-15 · handoff written · planning session · execution not started
