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
- [ ] Task 9 — podcast cover art
- [ ] Task 10 — clickable channels + avatars
- [ ] Whole-branch review

## 7. Final summary (fill in at the end)

_(rulings made, deferred minors, anything the owner must verify in the app)_
