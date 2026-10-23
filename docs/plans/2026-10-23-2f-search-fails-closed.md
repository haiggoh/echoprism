# Execution Plan — 2f: search surfaces store failures (handoff item 2)

_Authoring date: 2026-10-23 (GLM 5.3 Flash free session). Parent:
`docs/plans/2026-10-22-handoff-glm-flash.md` item 2. Same standing rules and
authority matrix as `2026-10-23-2e-podcast-search-ui.md` (master-only, staged
by path, nothing pushed/tagged/published, TDD + mutation checks with
cmp-guarded restores, per-milestone Gemini review)._

## Context (verified 2026-10-23, source)

`search_episodes` (`src-tauri/src/commands/episodes.rs:86-97`): after a source
returns videos, `db.upsert_video_results(&videos)` failures are logged as WARN
and the command returns the (possibly empty) LOCAL read as success. That is
how the 2d FK bug (missing `current-user` row) became a silent "no results"
instead of a visible error — the store failure carried the diagnosis and the
UI showed an empty screen. Owner instruction: when results came back from the
source but could not be stored, RETURN the error.

**Design decision:** return `Err` (not a toast). The command already has an
error path the Search screen renders ("Search failed"); a second channel
would be redundant state. Noted, out of scope: the Search screen's Retry
button is dead (`onClick={() => {}}`) — a pre-existing defect that this fix
makes more visible; recorded in the final report, not fixed here.

**Seam (decided):** extract the post-resolution tail of the command into
`search_episodes_resolved(db, query, params, videos, source)` — store (if any
videos) then local read. Tests drive it offline with a REAL failing store
(migrations-only pool, no `current-user` row → the FK 787 failure the 2d bug
rode in on) and a synthetic `VideoInfo`. Source resolution (instances →
yt-dlp) stays in the command and keeps hitting the network only in the
existing live smokes.

## Phases

1. **RED:** test `store_failure_surfaces_instead_of_reading_back_empty` —
   migrations-only pool (standing rule 11: `migrations::run` and NOTHING
   else), one synthetic VideoInfo, `search_episodes_resolved` must return
   Err naming the store failure. RED 1: fn does not exist (compile). Add the
   seam with the CURRENT swallow-and-WARN behaviour → RED 2 for the right
   reason (returns Ok with the empty local read). Wire the `?` → GREEN.
2. **Mutation:** revert the `?` to `let _ =` → the test goes red; restore,
   cmp-verify, green.
3. **Gates:** cargo (parallel), vitest, tsc (project binary), Playwright;
   live smokes stay green (untouched path).
4. **Review + records:** Gemini dispatch on the diff, triage; receipts here;
   roadmap "Where things stand" + "Next action" updated.

## Non-goals

The dead Retry button, toasts for store failures, instance-resolution
logging (that is handoff item 3's scope: silent failover branches).

## Receipts (2026-10-23, GLM 5.3 Flash free session — nothing pushed)

- **Phase 1 DONE** — RED 1: E0425 (fn missing). The seam added with the CURRENT
  swallow behaviour → RED 2 for the right reason ("a store failure must surface,
  not read back as success: []" — the exact incident behaviour). Wired `?` →
  GREEN. One test-design correction along the way, caught because RED 2 refused
  to appear: my first pool assumed a migrations-only DB lacks the
  `current-user` row — but the 2d FIX made the migrations create it, so nothing
  failed. The incident state is now injected explicitly (migrations + FK pragma
  + `DELETE FROM users`), documented as a fault fixture, not a setup skip
  (rule 11 intact: the 2d install-behaviour test still runs migrations and
  nothing else).
- **Phase 2 DONE** — mutation (`?` → `unwrap_or(0)`) → red; restore
  cmp-verified byte-identical; cargo 67/67 re-collected after the restore.
- **Phase 3 DONE** — gates: cargo 67/67 + 5 ignored live smokes untouched,
  tsc clean, vitest 160/160, Playwright 25/25.
- **Phase 4 DONE** — Gemini 3.8 Flash on the 125-line diff (115s). Output
  truncated mid-stream; its one substantive starter — `sqlite::memory:` is
  private per connection — is a trap this repo already documents (the podcast
  test helpers' comment; single-connection `max_connections(1)` pools are the
  established pattern, and only the CONCURRENT refresh test needs a temp-file
  DB). The moved `query`/`params` are used by nothing after the delegation
  (and a later use would be a compile error, not a silent bug). No finding
  survives triage.
- **Phase 5 DONE** — roadmap "Where things stand" + "Next action" updated
  (item 2 closed, item 3 next).

### Behaviour note

The store branch only runs when a source returned results, so the legitimate
offline path (source fails → nothing to store → local read as success) is
unchanged — that is 1b's designed degradation, not a swallow. What changed:
source SUCCEEDED but storage failed → the command now returns Err and the
Search screen renders its error state (the dead Retry button it reveals is
recorded in the final report as a separate pre-existing defect).
