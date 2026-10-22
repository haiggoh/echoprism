# Execution Plan — 2c: Real content (layout gaps, states, stub screens)

_Authoring date: 2026-10-22. Roadmap parent: step 2c — "Real content will
expose layout gaps: long titles, missing thumbnails, empty and error screens,
and slow servers."_

### Discovery findings (verified live, 2026-10-22)

1. **Four screens were static stubs with ZERO queries** — Channels,
   Downloads, History, SmartLinks each rendered a heading, a permanent
   `EmptyState`, and in two cases an inert button. All four had live
   wrappers and (for channels/history/smart-links) complete Rust backends;
   the mock router served two of the four. This is the extreme case of "real
   content exposes gaps": those screens could never see real content at all.
   Consequently **1d's smart-link backend was unreachable from the UI** —
   the same class of gap as the recorded 1c subscribe debt.
2. **Broken-thumbnail handling:** 8 `<img>` sites, 1 with an `onError`
   (which only hid the element, leaving a hole).
3. **Long titles:** cards and the mini player truncate; the PLAYER SCREEN
   rendered no title at all — nothing identified the playing episode.
4. **Downloads filter semantics were wrong:** the select offered
   All/Video/Audio while `list_downloads` filters by STATUS — the options
   could never have selected anything.
5. Loading/error states existed on 5-6 of 10 screens; the four stubs had
   neither. Slow servers: search already times out per instance (8 s) and
   falls back to yt-dlp; the screens that fetch now all show a loading line.

### Phases (receipts)

1. **Screen wiring — DONE.** Channels (list + unsubscribe), History
   (list + clear), Downloads (status filter + rows + cancel/delete),
   SmartLinks (list + Run Matching + confirm/unlink) — every one with
   loading / error-with-retry / empty states. Mock handlers added mirroring
   the Rust semantics (`unsubscribe`, `clear_history`, `list_downloads`,
   `cancel_download`, `delete_download`, plus `confirm_smart_link`,
   `unlink_smart_link`, `match_episodes` — the last reports an honest 0
   because the real matcher needs the Rust engine). A `downloads` fixture
   seeds the three row shapes the layout must survive: completed, in-flight
   (progress bar + Cancel), failed (error message shown). Tests:
   `src/__tests__/stub-screens-wired.test.tsx` (4) and
   `src/__tests__/smart-links-screen.test.tsx` (3) — including the status
   filter discriminator (selecting "failed" yields exactly the failed row).
2. **Thumbnails — DONE.** New `src/components/ui/Thumbnail.tsx`: renders
   the image, swaps to an on-brand prism-silhouette fallback when the src is
   absent OR fails to load. All 8 sites use it; `ui/EpisodeCard` keeps its
   richer variant-aware fallback (audio glyph) and now enters it on load
   failure too (state-lifted). Tests:
   `src/__tests__/thumbnail-fallback.test.tsx` (3).
3. **Long titles — DONE.** The player gained the missing title block
   (`line-clamp-2` + truncating channel line). The f04 e2e assertion that
   found the same text twice (mini player + new heading) now asserts the
   player's `heading` role — stricter, same intent.
4. **Gates — DONE.** tsc clean; vitest 129/129 (20 files); Playwright 24/24
   (15 axe scans, 2 keyboard, 7 flow specs).

### Recorded, not fixed here (with owners)

- **Podcast subscribe UI** — still unreachable (waypoint
  `1c-step-4-debt-podcast-search`); 2c wired the screens whose backends were
  complete, but subscribe needs a new affordance, not a stub repair.
- **Cross-device sync toggle** (Settings → Preferences) writes a DB field
  nothing reads — labelled experimental; owner's product call.
- **Player queue-side affordances** (chapter seek, mini-player expansion)
  stay owner-verified behaviours per the test plan; unchanged here.
- Search "slow server" UX is a per-instance timeout with fallback; a
  user-visible "trying next source…" indicator is a candidate for 2d/4g.

### Non-goals

New features (subscribe UI, downloads queueing), the light theme (2a
recorded: no palette exists), iOS.
