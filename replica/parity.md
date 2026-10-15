# EchoPrism Parity Report

Generated: 2026-10-15

Every score number below comes from running this exact command on 2026-10-15
(exit code 0):

```bash
python3 check_parity.py features.csv
```

A reader can reproduce all of them by running it again.

## Overall Score

| Metric | Score |
|--------|-------|
| **Feature Parity** (original=yes rows only) | **100.0%** (45.0/45 pts) |
| **Must-haves Done** (scored) | **5/5** |
| Skipped | 0 |
| Extras (clone-only, unscored) | 32 |
| Problems | 0 |
| Layout Parity | TBD (screenshots needed) |
| Overall (80% features + 20% layout) | TBD |

Missing (build order): none — the script prints an empty missing list.

Note: the script itself prints `SHIPPABLE` for this result. That verdict is
computed from the scored subset only (score ≥ 80% and all 5 scored musts
done); it says nothing about the 32 unscored clone-only rows or runtime
behaviour. See Scope & honesty.

---

## Scope & honesty

Read this before quoting the 100%.

**(a) The parity score covers only rows where `original=yes`: 20 of 52 data
rows in `features.csv`.** The other 32 rows are clone-only extras
(`original=no`) and are excluded from the score entirely.

**(b) 12 of those 32 clone-only rows are `priority=must`. They are UNSCORED
by this metric** — the 100% says nothing about whether they exist or work.
As printed by the script:

1. Unified queue: play next / add to end / reorder
2. Audio-only mode with background playback
3. Smart Episode Linking: audio↔video match
4. Chronological subscription feed (newest first)
5. Smart Episode Link badge + one-tap switch
6. Instance pool with auto-failover
7. Client-side SABR via yt-dlp/Shaka
8. Background audio playback (OS lifecycle)
9. Mini-player (persistent bottom bar + expand/collapse)
10. Position sync on format switch
11. Smart Episode Link confidence scoring
12. Player: audio/video toggle (PrismConvergeToggle)

These include the app's main differentiators versus the original: Smart
Episode Linking, the unified queue, and instance failover. A "100% parity"
headline therefore coexists with "the features that make this app different
are unscored".

**(c) The `clone` column is self-reported by the building session and is NOT
verified by this script.** The script scores whatever the CSV claims. What
has actually been verified (2026-10-15):

- `tsc`: 0 errors (run as part of `npm run build`)
- `npm run build`: OK — 536 modules transformed, exit 0

What is NOT yet verified:

- Runtime invoke round-trips (UI → Tauri command → Rust backend → response)
  have not been exercised. A clean build proves compilation, not behaviour.

**(d) Layout parity remains TBD.** No screenshots of the original or the
clone have been captured (`replica/clone-screens/` is empty), so no visual
diff has run. `imgdiff.py` and `parity.py` referenced in earlier revisions
are not present in this repo.

**Status line** — Verified: TypeScript compiles with 0 errors; production
build succeeds (535 modules, 2026-10-15); the parity script's arithmetic
over the self-reported CSV gives 100.0% (45.0/45 pts) with 5/5 scored
must-haves. Claimed but unverified: that every `clone=yes` row works at
runtime — including all 12 clone-only musts — layout parity, and the E2E
flows in `replica/test-plan.md`.

---

## Feature Breakdown

### By priority (scored rows only)

Derived from `features.csv` using the script's weights (must=3, should=2,
could=1) over `original=yes` rows; the points sum to the script's total.

| Priority | Rows | Implemented | Partial | Missing | Max pts |
|----------|------|-------------|---------|---------|---------|
| **Must** | 5 | 5 | 0 | 0 | 15 |
| **Should** | 15 | 15 | 0 | 0 | 30 |
| **Could** | 0 | – | – | – | 0 |
| **Total** | **20** | **20** | **0** | **0** | **45** |

(15 + 30 = 45.0 pts earned of 45.0 → 100.0%, matching the script.)

### By area (scored rows only)

| Area | Scored rows | Implemented |
|------|-------------|-------------|
| playback | 7 | 7 |
| ui | 5 | 5 |
| discovery | 2 | 2 |
| data | 2 | 2 |
| subscription | 1 | 1 |
| feed | 1 | 1 |
| browse | 1 | 1 |
| queue | 1 | 1 |

No `core`-area row is scored: every core-area row in the matrix
(Smart Episode Linking, instance pool/failover, position sync, the
audio/video toggle) is clone-only and therefore unscored.

---

## Clone-only rows (original=no) — unscored by this metric

32 rows total: the 12 musts listed under Scope & honesty, plus these 20
(15 should, 5 could). All are self-reported `clone=yes`; the script does not
verify them.

**Should (15):**

1. SponsorBlock integration (auto-skip + configurable categories)
2. Picture-in-Picture (reliable on all platforms)
3. Offline downloads (video + audio)
4. Instance pool management
5. Instance health dashboard
6. Smart Episode Linking manager
7. Sleep timer with fade out
8. Auto-download on WiFi
9. Storage management (auto-cleanup)
10. YouTube subscription export (portability)
11. Instance manual override (pin)
12. Queue: clear / save as playlist
13. Player: waveform (audio)
14. Instance latency display (ms)
15. Instance region/country display

**Could (5):**

1. SponsorBlock community submissions
2. Smart Episode Link: bulk import from history
3. Smart Episode Link: export/import matches
4. Cross-device queue sync (optional + encrypted)
5. Cross-device subscription sync (optional)

---

## Layout Parity

**Status**: TBD — Screenshots needed for each key screen at 1440x900
(desktop) and 390x844 (mobile), for both the original and the clone.
`replica/clone-screens/` exists but is empty; no diff tooling
(`imgdiff.py`) is currently in the repo.

---

## Behaviour Diff

| Flow | Original Does | Clone Does | Fix/Keep |
|------|---------------|------------|----------|
| F01 Onboarding | Google OAuth | Instance URL + type | **Keep** - privacy-first, no Google account needed |
| F03 Play Video | YouTube CDN | Instance pool + yt-dlp | **Keep** - privacy, ad-free, failover |
| F04 Play Podcast | Native RSS | RSS/Atom/JSON parser | **Keep** - unified pipeline |
| F06 Smart Link | YouTube Music link | Audio↔Video match | **Improve** - cross-platform episodes |
| F10 Smart Link | None | WiFi background matching | **New** - unique value prop |

(The Fix/Keep column is design intent, not a verified runtime result.)

---

## Next Steps

1. **Runtime invoke verification** — exercise each Tauri command from the
   running app and record pass/fail per feature; nothing currently proves
   runtime behaviour
2. **Layout screenshots** — Capture S01-S18 at 1440x900 and 390x844 for both
   original (public pages/user account) and clone (local dev)
3. **Layout diff** — restore/provide the imgdiff tooling and run it on each
   screen pair
4. **E2E tests** — Playwright specs for all 12 flows (see
   `replica/test-plan.md`)
5. **A11y audit** — axe-core on each screen
6. **replica-entrepreneur** — Read user reviews for positioning

---

## Summary

The parity script reports 100.0% (45.0/45 pts) over the 20 of 52 rows where
the original has the feature, with 5/5 scored must-haves done. That number
is arithmetic over a self-reported CSV: it does not cover the 12 clone-only
must-haves (including Smart Episode Linking, the unified queue and instance
failover), runtime behaviour, or layout.

Verified as of 2026-10-15: clean `tsc`, clean production build (535
modules), and the script output above. Claimed but unverified: that any
feature works at runtime end-to-end.

Earlier revisions of this file claimed 47.0/47 pts over 47 features and a
"SHIPPABLE / better than the original in every dimension" verdict; those
totals mixed the 32 clone-only rows into the score and are not reproducible
by `check_parity.py`.
