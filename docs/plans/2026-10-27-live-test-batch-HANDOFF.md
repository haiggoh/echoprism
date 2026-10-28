# HANDOFF — 2026-10-27 live-test batch, Tasks 4–10

**Read this whole file first and follow it exactly.** Adopt the standing rules below for the
entire session, then continue autonomously from **Next action**.

## 1. Why this exists

The owner asked (2026-10-27 11:31 CET) to hand the rest of this plan to a **StepFun Step 5
Preview** session at **max effort**. The previous session (Claude Opus 5.5, paid gateway,
session 0ab7959b) did Tasks 1–3 and stopped at that task seam. It was NOT killed by a limit or
error; nothing needs re-diagnosing.

## 2. State (all on `master`, all pushed to origin)

| Commit | Delivered |
|---|---|
| `09ce2e7b` `c64137c3` `7fed3330` | the plan `docs/plans/2026-10-27-live-test-batch.md` + owner corrections to Tasks 1 and 8 |
| `03609678` | **Task 1** — `src-tauri/src/netpath.rs`: remembered IPv6 verdict (`<app_data>/net-state.json`), background probe (all AAAA raced under one 3 s deadline), mid-flight switch to `--force-ipv4`; every yt-dlp call goes through `Extractor::yt_dlp_output` |
| `5a5be3fd` | **Task 2** — `Episode.channel: Option<EpisodeChannel>` resolved at read time (`queries::resolve_channels`) by get_feed / get_episode / search_episodes |
| `3aa547a4` | **Task 3** — recording a play invalidates `['history']` (`PlayerProvider.tsx`) |

Gates at hand-over: `cargo test` (in `src-tauri/`) **108 passed, 7 ignored**; `cargo build`
**zero warnings**; `./node_modules/.bin/tsc --noEmit` clean; `./node_modules/.bin/vitest run`
**228/228**.

Ledger (git-ignored, on disk): `.superpowers/sdd/2026-10-27-live-test-batch/progress.md` —
append one line per completed task there too. Rulings so far:
- Setup: execute on `master` in this checkout, no worktree (owner chose commit + push each).
- Task 1: probe races all AAAA addresses under one deadline (plan said "first address"; sequential took 24 s live).
- Task 1: storyboard keeps its own 30 s outer bound on top of the policy (a preview is decoration).

## 3. The goal, verbatim (owner, 2026-10-27)

> 10:52 — "also the headphone icon works now, but I know these podcasst normally should have real
> cover images, we need those displayed there. history still doesn't seem to work. smart links
> seems to work but it doesn't show user-readable title (only shows long id strings the user
> doesn't know how to judge). channels shows me a lot of channels I never subscribed to with the
> option to unsubscribe. also I'd like the channels liste there to be clickable to I can explore
> them and the should have small profile pictures"

> 11:05 — "on my feed I see a lot of vergecast videos, playback worked in a earlier version but
> seems to get stuck on load in the current version. playing podcasts works currently. both
> videos and podcasts are all falsely categorized as unknown channel. important feature:
> playback speed, doesn't exist yet but I want it. also the queue isn't working correctly yet, I
> should be able to skip between items in the queue (play next, play previous)."

> 11:20 — "let restarting be a separate button so that previous always means previous"

Owner decisions: unsubscribed channels are **hidden, never deleted**; run all tasks
smallest-first, commit + push each.

## 4. Standing rules

1. **Autonomous**: decide and record (`Ruling: <what> — <why> — <cost if wrong>` in the ledger)
   instead of asking; stop only for a fork that cannot be weighed.
2. Work only in `~/ClaudeWorkspace/echoprism`, on `master`. Never switch its branch, never create
   a worktree for this plan.
3. Commit each task, staged **by path** — never `git add -A` / `git add .`. **Never stage
   `node_modules/.package-lock.json`** (it shows as modified; leave it). End every commit message
   with exactly:
   `Co-Authored-By: Step 5 Preview <noreply@stepfun.com>`
   Push `master` after each task (`git push origin master`). **Never tag, release, or force-push.**
4. **TDD every change**: write the test, run it, see it FAIL for the right reason (missing
   behaviour, not a typo or import error), implement, see it PASS. Mutation-check each new guard
   (break it on purpose, confirm a test fails, restore, `cmp` to prove the restore). Never weaken
   or delete a test to get green.
5. Gates before every commit, all four: `cargo test` and `cargo build` (zero warnings) in
   `src-tauri/`; `./node_modules/.bin/tsc --noEmit`; `./node_modules/.bin/vitest run`.
   **Use `./node_modules/.bin/…`, never `npx`** (npx resolves a global tsc). Write test output to
   a file and read its tail — and **delete that file before each run**, or a failed command shows
   you the PREVIOUS run's "passed" line.
6. **Mock parity**: whatever a Rust command returns, `src/mocks/router.ts` returns the same shape,
   and every new command gets a TS binding in `src/hooks/useTauriCommands.ts` and passes
   `src/__tests__/tauri-command-contract.test.ts`. Three of today's bugs were mock-satisfied and
   real-broken.
7. **Never write to the owner's real database** (`~/Library/Application Support/app.echoprism/`).
   Read it only with `sqlite3 -readonly`. Tests use temp/in-memory DBs.
8. Before an Edit, **read the exact lines you anchor on** (Read with offset/limit). Never build an
   `old_string` from memory or from a truncated `sed`/`grep` view.
9. zsh shell: quote globs (`'*.ts'`), never start a word with `=`, never put `$1`/`$40` in double
   quotes.
10. Never run `remote-session.sh --stop`, never start another remote session, never kill anything
    listening on ports 4141–4151 — one of them is the proxy you are running on.
11. Never print process argv (`ps aux`, `pgrep -fl`): it can carry API keys.
12. Record progress at each task: a ledger line AND a tick in §6 of THIS file, in the same commit
    as the task.

## 5. Next action

Open `docs/plans/2026-10-27-live-test-batch.md` and execute **Task 4** ("Channels lists
subscriptions only; Unsubscribe is real"), then Tasks 5, 6, 7, 8, 9, 10 in order, exactly as each
task's steps say. Read each task's text in full before starting it. When all are done:
run a whole-branch review with an independent dispatch
(`python3 "$(ls -d ~/.claude/plugins/cache/haiggoh/free-agents/*/ | sort -V | tail -1)bin/free-agent-tool.py"`
with the diff `git diff 09ce2e7b..HEAD` attached), check each finding against the real code
(reviewers invent file names), fix confirmed Critical/Important findings TDD-style, then write a
final summary into §7.

## 6. Progress (tick as you go)

- [x] Task 1 — `03609678`
- [x] Task 2 — `5a5be3fd`
- [x] Task 3 — `3aa547a4`
- [x] Task 4 — channels subscribed-only + real unsubscribe
- [x] Task 5 — Smart Links titles
- [x] Task 6 — Tauri capabilities — ⚠️ **OWNER-VERIFY PENDING**: launch `tauri dev`, use the native Playback menu, and confirm `crash-reports.jsonl` gains no new `event.listen` line. Code + test + build verified; only the runtime check is outstanding.
- [x] Task 7 — playback speed
- [x] Task 8 — queue next / previous / separate restart
- [x] Task 9 — podcast cover art (owner action: press Refresh once to backfill)
- [x] Task 10 (part) — clickable channels done (/channels/:channelId + ChannelScreen); PODCAST avatars done via the refresh backfill; **VIDEO-channel avatars still OPEN** (Invidious /api/v1/channels/{ucid} authorThumbnails + yt-dlp fallback)
- [ ] Whole-branch review

## 7. Final summary (fill in at the end)

**All ten tasks are complete**, in 21 commits on `master` (from `09ce2e7b`), every one gated: `cargo test` **136 passed**, `cargo build` **zero warnings**, `tsc --noEmit` clean, `vitest` **260/260** (from 108 + 228 at handover).

### Rulings made (and why)

- **`subscribed_at` is set to `''`, not NULL** — `schema.sql:83` declares the column `NOT NULL`, so the plan's `NULL` would need a full SQLite table rebuild on the owner's live DB, and `''` is already this codebase's "no subscription time" representation (mock fixture `ch-5`).
- **`nextTrack`/`previousTrack` kept their names** rather than the plan's `next()`/`previous()` — a rename would churn PlayerScreen, MiniPlayer, useMediaSession and useMenuPlayback for no behavioural gain.
- **Persistence for playback rate lives in PlayerProvider**, wrapping the store action, so the slice stays a plain state holder.
- **The src-change rate re-application reads a ref**, so the resolve effect does not re-enter its `play()` branch on every rate change.
- **`list_channels`' two duplicated branches collapsed into one statement** (`WHERE type = COALESCE(?, type) AND is_subscribed >= ?`) so the typed/untyped × subscribed/everything matrix cannot drift.
- **`hasPrevious` is never true at the first item** — previous does not wrap. `hasNext` is true at the last item only under repeat `all`, which really does wrap.
- **The picker takes the SMALLEST `authorThumbnail` tier meeting 88 px**, not the largest: Invidious returns ascending, so a 1024 px master to fill a 40 px circle is waste.
- **`height` is not kept on the parsed thumbnail shape** — nothing decides on it and an unused field breaks the zero-warnings gate; serde ignores unknown fields so real responses still parse.

### Deferred minors (found, deliberately NOT changed)

- The queue header's **"Save as playlist"** button has `onClick={() => {}}` — a silent no-op that looks like a working control. Wire it or disable it with an explaining title.
- `d7-play-mode-chain.test.tsx` **flakes** (one red in five full-suite runs; 13/13 in isolation). Filed as waypoint `echoprism-d7-flaky-test` — do not re-run-and-hope it away.
- The **`Sqlite` dev database was stale**; the repo now ships `scripts/sqlx-prepare.sh`, which prepares against a throwaway DB built from `sql/schema.sql` so a stale input can never poison `.sqlx` again.
- Commit `558702f6`'s body contains a typo ("tscclean"); not fixed because that would mean rewriting pushed history.

### What the owner must verify in the app

1. **Task 6** — launch `tauri dev`, use the native Playback menu, confirm `crash-reports.jsonl` gains no new `event.listen` line. Code + ACL resolution are verified; the runtime was not.
2. **Task 9 / Task 10a** — press **Refresh once** to backfill cover art onto the 1,102/1,103 existing podcast episodes and channels.
3. **Task 10b** — open Channels; video-channel avatars resolve from Invidious, four at a time.
4. **The confidence curve changed** — scores rise where channel metadata was absent, so more pairs may auto-link. The hard title gate (0.7) still protects, and all nine calibration tests pass, but watch a matcher re-run before trusting the new curve wholesale.

### How the work was verified

Every behavioural change was mutation-checked (each guard broken on purpose, a test seen red, restored, `cmp`-identical). Four mutation checks found real gaps that green tests had missed: an untested default path (T4), a **vacuous** test whose fixture a unique constraint silently dropped (T5), an untested range guard (T7), and a channel backfill whose "never overwrite" half was unpinned (T10a). The whole-branch adversarial review was dispatched to a free validator; of its four named findings, one was confirmed and fixed (`36b912de`), and the other three were rejected with reasons recorded in that commit.
