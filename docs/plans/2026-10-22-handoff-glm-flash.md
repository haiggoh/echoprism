# Handoff — GLM 5.3 Flash session, after step 2d

_Written 2026-10-22 ~21:45 UTC by the Opus gateway session that took over when the
echoprism-25 free session stalled. Read this file first, then
`docs/plans/2026-10-19-release-roadmap.md` and `docs/plans/2026-10-22-2d-native-mac-polish.md`._

## Why this handoff exists

The echoprism-25 session (`remote-session.sh nvidia-glm53-thinking --effort max`, proxy
:4143, swapped to DeepSeek V4.1 Flash on 10-21) finished 2a–2c, then every turn from
17:38 UTC failed with NVIDIA `429 Too Many Requests` (no fallback on that proxy).
Owner's working hypothesis, NOT established: NVIDIA applies per-model penalty timeouts
after sustained use (GLM first, then DeepSeek, each after long runs). Opus then did 2d
and fixed three live bugs. You continue from there.

## State at handoff (all on `master`, nothing pushed)

- `f5377dba` roadmap: 2a–2c delivery notes (written by echoprism-25).
- `3e5e5d8c` + `d97c3001` window-state: geometry persisted, VISIBLE not (read the
  correction in the 2d plan, finding 3, before touching window visibility).
- `13e7476a` W3C Media Session (Now Playing + media keys) — `useMediaSession`.
- `27c773a9` **search was storing nothing**: the `current-user` row now comes from the
  migrations (it existed only in scripts/seed.sql and test fixtures → FK 787 on every
  search-result batch → search read back an empty DB).
- `d4e40721` **playback**: yt-dlp got `-f video`/`-f audio` (invalid). Now audio =
  `bestaudio[ext=m4a]`, video = H.264 HLS master manifest (YouTube serves no muxed files).
- `e78274da` **thumbnails**: the yt-dlp search parser now reads `thumbnails`, and a
  later search fills a MISSING thumbnail on already-stored rows.
- `aaaa9511` native Playback menu (`app_menu.rs` + `useMenuPlayback`).
- Gates: cargo lib 64/64 (+5 ignored live smokes), vitest 150/150, tsc clean, Playwright
  24/24. Working tree clean except `node_modules/.package-lock.json` (npm noise — never
  commit it).

**Owner-confirmed live (2026-10-22):** YouTube search returns results, thumbnails
show, a video plays. **Not yet verified by the owner** — do not claim these work:
sound, audio-only mode, Now Playing, ⏯/⏭/⏮ keys, the Now Playing scrubber, ⌘←/⌘→
inside the search box (the Playback menu's key equivalents may steal them from the
text field — if so, that is a real defect to fix, e.g. move next/previous to ⌥⌘),
window restore after close → Dock → ⌘Q. List them in your final report as owner-verify.

## The goal (set this with /jgoal at session start, verbatim)

Get the EchoPrism repo (~/ClaudeWorkspace/echoprism) to first-release readiness per
docs/plans/2026-10-19-release-roadmap.md: close the open search/podcast gaps below, then
step 4 (4a-4e) as far as possible without an Apple/paid signing identity, and prepare the
delivery routes (build-from-source installer, Homebrew formula, GitHub Releases workflow) —
everything prepared to ship, nothing pushed/tagged/published.

## Owner's standing rules (unchanged from the 2026-10-20 handoff, plus three new)

1. **Autonomous.** Keep going without stopping between steps; use /run-to-completion.
   Ask only what truly cannot be decided with pros and cons; otherwise decide and record
   the decision in the plan doc.
2. **Commit every milestone**, staged BY PATH (never `git add -A`), with the trailer for
   the model you are actually running as (memory `commit-attribution-by-model`; check the
   proxy config — echoprism-25's :4143 turned out to be DeepSeek, not GLM). **Never push,
   tag or publish.**
3. **Bug-check everything:** TDD (RED for the right reason → GREEN), /check-code, and a
   mutation check per behaviour you add. Guard every mutation with `cmp` against the
   original — an edit that matched twice once silently did not apply and the "caught"
   result was meaningless.
4. **Adversarial review per milestone** via
   `~/ClaudeWorkspace/free-agents/bin/remote-agent-dispatch.py --provider gemini --model
   gemini-3.8-flash --allow-remote-files --files <patch> ...`. Triage every finding against
   the real code. Keep each finding ≤4 lines in the prompt.
5. Free session: offload for QUALITY (review, bug-hunting), not to dodge hard work.
6. Gemini 4 / Pro are NOT free (`limit: 0`). Gemini quota renews just after 00:00 UTC.
7. Each milestone: one plan doc in `docs/plans/`, receipts per phase, then a delivery note
   in the roadmap's "Where things stand" plus an updated "Next action".
8. **Never run `remote-session.sh --stop`, never start another session, never kill
   anything on ports 4141-4151** — one is your own proxy, and the stalled echoprism-25
   session still holds :4143.
9. **NEW — typecheck with `./node_modules/.bin/tsc --noEmit`, never `npx tsc`.** The rtk
   hook rewrites `npx tsc` to the GLOBAL Homebrew tsc 7.0.2, which rejects this TS-5
   tsconfig (TS5102 `baseUrl` removed) — false failures, and piped through `head` it can
   look clean. The project pins TypeScript 5.9.3.
10. **NEW — `tauri dev` watches all of `src-tauri/`** (even files no `mod` references):
    any save there rebuilds and relaunches the app. Do not edit there while the owner is
    testing a running build.
11. **NEW — fixtures must not do setup production skips.** Every Rust test pool seeded
    the user the app never created; that hid a bug that broke search entirely. A test for
    install-time behaviour runs `migrations::run` and NOTHING else
    (`search_results_store_on_a_migrations_only_database` is the pattern).

## Next action — in this order

1. **Podcast search from the UI** (waypoint `1c-step-4-debt-podcast-search`). The
   backend exists (`search_podcasts` → iTunes, `subscribe_podcast`), but nothing in
   `src/` calls either (verified: zero hits), so the Search screen only filters the
   local DB and "Vergecast" finds only the YouTube videos. Add the command wrappers and
   mock-router handlers, show iTunes results on the Search screen (Podcasts filter, or a
   section), and a Subscribe action that then lists the feed's episodes. Live-smoke with
   "Vergecast": the podcast feed AND the videos must both appear.
2. **Search fails open.** `commands/episodes.rs` logs a failed `upsert_video_results`
   as WARN and returns the (empty) local read as success — that turned a hard FK error
   into a silent "no results". Return the error (or surface a toast) when results came
   back from the source but could not be stored. Test with a store that fails.
3. **Every search falls back to yt-dlp.** Live log 2026-10-22: three searches, all
   `via yt-dlp`, no instance failure logged — so the Invidious/Piped instances answered
   with EMPTY lists (`Ok(Ok(_)) => continue` logs nothing). Log that branch, then find
   out whether the seeded instances are dead or the parser misses their current shape
   (capture a live response into `src/extractor/fixtures/` first, as 1b did).
4. **Thumbnails load slowly** (owner: "just a few videos get them after seconds").
   Investigate, do not guess. Hypotheses to test in order: (a) rows stored before
   `e78274da` have no image until a search re-returns them (count NULL `thumbnail_url`
   in the live DB); (b) the stored image is the large `hq720` variant — compare against a
   smaller width from the same `thumbnails` list; (c) `Thumbnail.tsx` lazy-loading or
   decode behaviour. Measure before/after.
5. Then **step 4**: 4b name check, 4c/4d/4e delivery routes (build-from-source script,
   Homebrew cask in the owner's tap, GitHub Releases workflow), all prepared, nothing
   published.

## Recorded for later (owner, 2026-10-22) — do NOT build in this run

- **Play preview on hover** for thumbnails (YouTube-style muted preview). Not high
  priority; fold in after the first release unless the owner reprioritises. Recorded in
  the roadmap's known gaps.

## Launching this session (owner)

`remote-session.sh nvidia-glm53-thinking --effort max` (GLM 5.3 Flash, thinking), then
paste: "Read docs/plans/2026-10-22-handoff-glm-flash.md first and follow it exactly: set
the /jgoal to the goal it states, then start at Next action item 1." If NVIDIA returns a
429 on the first turn, the per-model allowance may still be exhausted — retry later
rather than switching models mid-handover without noting it here.
