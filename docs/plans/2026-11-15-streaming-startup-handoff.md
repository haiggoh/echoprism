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
- 2026-11-15 · Phase 0 preflight · (no commit) · canonical clean at 8fb8bfc6; worktree ~/.wt/ep-startup created; tag v0.1.19 latest; baselines green (cargo 194/0/12, vitest 372/372); migration = src-tauri/src/db/migrations.rs migrate_data ALTER list; ship script ~/.local/bin/rtc-ship.sh
- 2026-11-15 · Task 1 start-up timer · 3d065bbd + acfd0eba · RED→GREEN: cargo startup_timer 2/2, vitest startup-timer 3/3; full suites green (rust 196/0/12, vitest 375/375, tsc clean); discriminant: eviction removed → RED (60≠50), reverted → 2/2; offload validator (mistral-large4, cross-family) found shifted info! args → test strengthened (RED on values), fixed acfd0eba
- 2026-11-15 · Task 2 per-capability instance health · 4eda94ac · RED→GREEN: stream_health_tests 4/4 (fake upstream: /streams 500 → excluded from order_for_stream while order_for_search keeps it; 500→200 re-admits; streak flips stream not search health); full rust 200/0; discriminant: stream probe pointed at /search → RED (Healthy≠Failed), reverted → 4/4; offload validator (gemini-3.8-flash, cross-family): no findings
- 2026-11-15 · Task 3 polled available_at gate · 5abc5cbc · RED→GREEN: gate_poll_* 3/3 + updated resolver_polls_gate_until_lock_opens + refresh_keeps_playing_format_and_gates_on_the_lock; full rust 203/0; discriminant: interval 5 s → gate test RED (waited 5.0 s), reverted → GREEN; LIVE (IPv4): ytdlp_ms=4019 gate_ms=2555 probe_ms=415; offload validator (gemini-3.8-flash) reported 3 phantom defects — its file attachment was truncated mid-file (obs 0125); worktree file verified intact, tests green
- 2026-11-15 · Task 4 stream cache + prefetch_stream · 2e93be34 · RED→GREEN: stream_cache tests 6/6; full rust 209/0, vitest green, tsc clean; test caught a real dedupe bug (in-flight cell removed → 2 resolves) fixed pre-commit; discriminant: dedupe lookup removed → RED (2≠1), reverted; offload validator (gemini-3.8-flash): no findings
- 2026-11-15 · Task 5 frontend pre-resolve triggers · 696696d7 · RED→GREEN: prefetch-stream 8/8; full vitest 383/383, tsc+eslint clean, e2e f03 2/2, rust 209/0; partial-mock convention `?.` for prefetch/invalidate; discriminant dwell=0 → RED, reverted; offload validator (gemini-3.8-flash): no findings
- 2026-11-15 · Task 6 audio-only never selects video · aacc6880 · RED→GREEN: 2 new tests; full rust 211/0 after updating 4 old-fallback-pinning tests (named in commit); discriminant: muxed fallback re-added → RED (format 18 in audio rank), reverted; offload validator (gemini-3.8-flash): clean on the visible (truncated) portion — obs 0125
- 2026-11-15 · Task 7 podcast tracker stripping · f9859bc6 · RED→GREEN: tracker_strip 9/9 incl. verbatim dev-DB URL; frontend fallback-once GREEN; full rust 220/0, vitest 384/384, tsc clean; LIVE IPv4: stripped → 206 ttfb 1.99 s; discriminant mgln.ai dropped → RED ×2, reverted; offload validator: no findings
- 2026-11-15 · Task 8 cold path · 91eced3e · 27 yt-dlp runs (IPv4): mediaconnect wins (2.2–4.0 s, keeps audio+HLS) → YT_DLP_EXTRACTOR_ARGS on every -J; HLS escapes the gate (200 immediately, no headers, absolute variant URLs); extractor_args test GREEN (RED first); full rust 221/0; LIVE cold video 10.7 s / audio 7.0 s → waypoint echoprism-cold-start-still-5 (owner-gated) + findings doc
- 2026-11-15 · Task 9 capped adaptive HLS · c03dee5f · Step 0 RESOLVED by real WKWebView probe (system Swift; 640px element on 1080p master → ≤480p only): ONE master at fullscreen cap, no swap/hls.js; filter_master_playlist 7/7; /hls/ proxy route; video → ungated HLS + gated progressive fallback; hls_error_uses_fallback_url GREEN; rust 229/0, vitest 385/385, tsc clean, e2e 2/2; discriminant h<cap → RED, reverted; offload validator: no findings
- 2026-11-15 · Task 10 quality+podcast settings · (committing) · 7 new pref fields (serde+DB defaults, migrations ALTERs, .sqlx regenerated via scripts/sqlx-prepare.sh) + patch/apply + effective_caps (data saver→480); wired: skip_podcast_trackers → enclosure strip, fullscreen cap + start → extractor.hls_cap/hls_start (seeded at startup, pushed live by update_settings); SettingsScreen "Playback quality" section (7 controls, one-field patches); tests: settings 8/8 (old-row defaults, one-field patch, data_saver caps), quality-settings 6/6, rust 232/0, vitest 391/391, tsc+eslint clean; discriminant: serde default dropped → old-row test RED (missing field), reverted
