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
