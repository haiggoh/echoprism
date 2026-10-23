# Execution Plan — 2h: thumbnails load slowly (handoff item 4 — investigate, then fix what the evidence names)

_Authoring date: 2026-10-23 (GLM 5.3 Flash free session). Parent:
`docs/plans/2026-10-22-handoff-glm-flash.md` item 4. Standing rules and
authority matrix as 2e/2f/2g._

## The investigation (measured 2026-10-23 — live DB, live network, live yt-dlp)

- **(a) NULL rows — real, minor, already self-healing.** The live DB has 62
  episodes, 11 with no thumbnail; ALL 11 are video-channel rows stored before
  `e78274da` (the parser read no `thumbnails` then). The `e78274da` backfill
  fills a MISSING thumbnail when a later search re-returns the video — these
  heal by design. No change.
- **(b) variant selection — the live issue.** Every stored thumbnail is the
  SIGNED 720-wide variant. The parser picks it deliberately:
  `parse_yt_dlp_search` uses `.max_by_key(width)`. A live capture today shows
  yt-dlp's flat-playlist offers exactly two variants per video: 360×202 and
  720×404 (same `hq720.jpg` file, different signed `sqp` resize params).
  Measured bytes: **360 → 24 KB; 720 → 60–220 KB** (varies by capture), ~same
  latency (~0.15 s). A 50-result search therefore pulls 3–11 MB where ~1.2 MB
  suffices — with the browser's 6-connections-per-host limit that is exactly
  "the first few thumbnails arrive, the rest take seconds".
- **(c) Thumbnail.tsx — nothing to fix.** `EpisodeCard` already passes
  `loading="lazy"` through to the `<img>`; `decoding="async"` is the browser
  default. No change.
- **Fix (b):** select the SMALLEST variant with `width >= 300` (the live 360
  crop is card-correct AND properly 16:9 — the unsigned `hqdefault.jpg`
  alternative is 4:3-with-bars, measured only for completeness), else the
  largest available. Retina softness at ~350 px cards is the accepted
  trade-off for 3–9× fewer bytes; the owner's complaint is slowness.
- **Scope notes:** the Piped search parser's `.last()` picks the smallest
  Piped variant already — acceptable, watch only. Stored rows keep their 720
  URLs until re-returned (the 1b non-clobbering policy is deliberate); the
  fix improves every NEW search immediately and the grid heals as searches
  re-return videos.

**Before/after (measurable proxy):** 50-card search, per-image bytes
60–220 KB → 24 KB (≈3–9× total reduction); in-app rendering timing remains
owner-verify. The fresh capture is committed as
`fixtures/yt_search_vergecast_thumbnails.jsonl` (the 1b fixture predates
thumbnail parsing — no `thumbnails` key).

## Phases

1. **RED:** `pick_card_thumbnail` tests — from the committed live fixture, the
   parsed entry's thumbnail is the 360-wide URL (current code yields 720 →
   red); plus the synthetic edges: only-{720,1280} → 720; only-{1280} → 1280;
   only-{200} → 200; empty → None.
2. **Implement:** replace `max_by_key` with `pick_card_thumbnail` in
   `parse_yt_dlp_search`.
3. **Mutation:** revert to `max_by_key` → red; restore, cmp-verify, green.
4. **Gates + review + records:** cargo (parallel), tsc, vitest, Playwright,
   live smokes; Gemini dispatch; receipts; roadmap updated.

## Non-goals

Backfilling 720 URLs out of stored rows (non-clobbering), Piped parser
changes, Thumbnail.tsx changes, a thumbnail proxy/cache.
