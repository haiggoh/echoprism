# EchoPrism — Roadmap to a First Public Release

- **Date:** 2026-10-19
- **Status:** Agreed with the owner on 2026-10-19, on all counts, with the adjustments
  recorded below (see **Decisions** and the adjusted items 3a, 4c, 4d, 4f).

## Decisions (owner, 2026-10-19)

1. **No Apple Developer Program membership ($99/yr) for now.** The app stays free and
   open source. iOS work is deferred until this decision changes (see Step 3).
2. **Distribution must offer at least three acquisition routes.** Homebrew (the owner's
   own tap) is one option among several — never the only one (see 4c).
3. **Crash reports, if collected, are opt-in and must never be read raw by the owner:**
   a GitHub Action files issues automatically so GitHub issues are the single source of
   truth (see 4f).

## Where things stand (2026-10-19)

- Brand v5 prism mark committed through `2df02751`; dock icon and sidebar unified behind
  one `PrismAppIcon` component with a sync guard test (`bc858a24`).
- macOS close-to-Dock behaviour: closing the window hides it, playback continues in the
  Dock, Cmd+Q quits (`b7c68bda`). Owner-verified 2026-10-19: window hides, Dock click
  restores it, Cmd+Q quits. Playback-while-closed still untested — needs working search
  (1b) first, since there is nothing to play yet.
- **Step 1a done (2026-10-19):** the five background tasks now start at launch — the
  starters had been `async fn`s called without `.await`, so their futures were dropped
  and no loop ever ran; they now spawn onto the tauri async runtime (smoke-run verified).
  Follow-up shipped the same day: `tracing` now installs a real subscriber at startup
  (`logging::init_tracing` in `run()` — RUST_LOG-aware, default info), so log output is
  visible; it had been silently discarded app-wide.
- Nothing pushed yet.
- **Step 1b done (2026-10-20):** search queries real backends — Piped/Invidious
  instances in health/latency order (8s timeout each), then the local yt-dlp binary as
  the guaranteed fallback. Premise amended by evidence: the public Invidious API is
  disabled ecosystem-wide (official registry marks every instance `api:false`, verified
  2026-10-20), so instances remain a user-added/self-hosted tier while yt-dlp (installed
  via brew) guarantees results; pipedapi.ducks.party was verified live and is seeded as
  the single default instance. Results are stored keyed by external video id (never
  clobbering user state; discovered channels stay unsubscribed) and surface through the
  existing FTS + smart-link search; `stream_episode` resolves real URLs through the
  same failover. Verified: 21 cargo tests + 2 live (network) smoke tests, 116 vitest,
  8 Playwright, contract-test mutation check, live smoke 2/2.
- **Step 1c done (2026-10-20):** podcast search via the iTunes Search API (no key),
  subscribe persists channel + feed + episodes in one transaction (idempotent on
  `UNIQUE(user_id, feed_url)`, FTS-searchable, non-clobbering), and the background
  feed task refreshes due feeds. Atom feeds fail explicitly instead of returning an
  empty success. Commits `b2fcaf2c` (feature) and `a7fe9a1d` (review fixes: per-feed
  guid de-dup, due check on app-written RFC 3339 timestamps). Verified: cargo 29/29 +
  3 live smoke, vitest 116/116, tsc clean, Playwright 8/8, contract mutation check.
  Deferred to 1e: refresh fetches due feeds one at a time.
- **Step 1d done (2026-10-20, overnight free session):** smart links work on real
  data end to end. The two matcher input queries were empty stubs written for tables
  that never exist — both now read the unified `episodes` table and exclude
  already-linked ids (commit `54785734`). The matcher's inverted stop-word filter is
  fixed and scoring recalibrated against the committed real-show fixtures
  (`c8e9d1a7`); the three smart-link commands are unstubbed and error on unknown
  link ids (`3321481e`). The live three-show smoke (real iTunes + feeds + yt-dlp,
  1859×15 candidates) found two defects the fixtures missed — fuzzy normalization
  saturating on subsequence matches, and titles collapsing to the show name alone —
  both fixed; the final run pairs exactly the 7 genuine same-episode pairs with zero
  false pairs (`8fa557c0`). Gates: cargo 45/45 + 4 live, tsc clean, vitest 116/116,
  Playwright 8/8, contract mutation check; Gemini review of the full diff: no
  findings. Playback-while-closed re-run automated: close hides the window, the
  process and background loops keep running, Cmd+Q quits; the audible confirmation
  stays owner-observable. Plan doc with full receipts:
  `docs/plans/2026-10-20-1d-smart-links-real-data.md`. Warning count ~25 → 22
  (matcher dead fields gone); 1e still owns the rest.
- **Step 1e done (2026-10-21, overnight free session):** cargo build is at ZERO
  warnings — the future-incompat crate class retired by removing 16 provably
  unused direct dependencies (`18c0a1a6`, three named by the roadmap + thirteen
  more the same 0-reference audit found), and all 20 dead-code warnings resolved
  by disposition: superseded code deleted with evidence (the pre-1b extract path,
  `get_best_instance`, `Extractor.pool`), unwired-future features kept with their
  reason at the site (`5afd285e`), and 8 registered no-op commands removed from
  both surfaces (`9cc1851f`). Hardening delivered along the way: the search type
  filter is wired into FTS (`bcda67c0` — it was silently dropped, making the UI
  toggle decorative), feed refresh fetches concurrently with cap 4 and sequential
  stores (`20fdcdae` — with a measured SQLITE_BUSY finding the recon spec missed),
  the stream resolver speaks Piped to Piped instances (`24f8d5c5` — it 404'd on
  the seeded default instance and silently fell through to yt-dlp on every play,
  found by recorded-response captures and closed by a new live smoke), and the
  strongest flake mechanism hardened (`e3758951` — the flake itself did not
  reproduce in 5 runs; identity unconfirmed). Gates: cargo 53/53 + 5 live, tsc
  clean, vitest 116/116, Playwright 8/8, contract 4/4. Plan doc with full
  receipts: `docs/plans/2026-10-20-1e-hardening.md`. Open debt recorded for
  step 2: 1c's plan step 4 (podcast search/subscribe wrappers + UI affordance)
  never shipped — subscriptions are unreachable from the UI.
- **Step 2a done (2026-10-22):** design audit against the brand, with measured
  (not eyeballed) contrast. Fixed: the Settings theme control was pure
  decoration (every radio `checked` with an empty onChange, wired to nothing,
  offering a "light" that has no palette and — via the provider — a CSS class
  with zero matching rules); `::selection` was 1.25:1 (invisible selected text)
  → 13.07:1; `--color-text-muted` failed AA on hover surfaces (3.86) → 5.17 min;
  `--color-danger` failed as badge text (3.76) → 4.83; 8 raw-palette bypasses
  swapped to tokens (`--color-warning-strong` added). New theme test file,
  mutation-checked. Commit `eec0e263`; plan
  `docs/plans/2026-10-21-2a-design-audit.md` (incl. brand.md's stream-colour
  table conflicting with the D-spec the code follows — flagged for the owner).
- **Step 2b done (2026-10-22):** the axe gate now covers every route and every
  Settings tab (3 → 15 scans; unaudited surfaces are how 2a's defects survived).
  It immediately found four real defects — `/search` had no heading at all, the
  Search input and Downloads filter had no accessible names, and the Settings
  scroll region was keyboard-unreachable — all fixed. New keyboard spec (Tab
  traversal + the BRAND focus ring, colour-asserted after the first version
  passed against a deleted ring). Commit `cf73cb8e`; plan
  `docs/plans/2026-10-21-2b-accessibility.md`.
- **Step 2c done (2026-10-22):** the biggest find of step 2 — Channels,
  Downloads, History and SmartLinks were static stubs with ZERO queries, so
  1d's smart-link backend was unreachable from the UI and three backends had no
  screen at all. All four wired with loading/error/empty states and tests; the
  Downloads filter was offering media types the command never accepted (it
  filters by STATUS). Thumbnails: 8 img sites, 1 onError → a shared
  `Thumbnail` with an on-brand fallback. The player screen rendered no title;
  it now shows title (line-clamped) + channel. Commit `bf14879a`; plan
  `docs/plans/2026-10-22-2c-real-content.md`. Gates: tsc clean, vitest 129/129,
  Playwright 24/24.
- **Step 2d done (2026-10-22, Opus):** premise corrected first — the media-session
  plugin has no macOS backend, so Now Playing + media keys go through the W3C Media
  Session API (`13e7476a`); native Playback menu inserted before Window (`aaaa9511`);
  window state persists geometry, not visibility (`3e5e5d8c`, `d97c3001`). The live
  probe exposed that **search had never stored a result on a real install** (user row
  only in seed/test fixtures → FK 787, `27c773a9`), **playback could never resolve**
  (`-f video` passed to yt-dlp; no muxed formats exist → m4a / HLS master,
  `d4e40721`) and **yt-dlp results had no thumbnails** (`e78274da`). Owner-confirmed:
  search, thumbnails, video playback. Owner-verify still open: sound, audio-only, Now
  Playing, media keys, ⌘←/⌘→ in the search box. Gates: cargo 64/64, vitest 150/150,
  tsc clean, Playwright 24/24. Plan `docs/plans/2026-10-22-2d-native-mac-polish.md`.
- **Step 2e done (2026-10-23, GLM 5.3 Flash free session):** 1c's step-4 debt
  closed — the podcast backend is reachable from the UI. A "Podcast directory"
  section on the Search screen queries iTunes on the SUBMITTED term (rate-limit
  courtesy; the local FTS search keeps its per-keystroke behaviour) and renders on
  the 'all' and 'podcast' filters; Subscribe runs the 1c one-transaction command,
  toasts, and lists that feed's episodes inline through a new optional
  `channel_id` filter on `get_feed` (QueryBuilder rewrite of the two `query_as!`
  branches; serde renames pinned by a contract test after the review pass found
  nothing exercised the serde path). The mock world mirrors the Rust contract
  (idempotent subscribe, unknown feeds REJECT). Commits `0b7371cb` (plan),
  `6ba6483a`, `fef9e447`, `ca471732`, `5f439d43`, `420c32f6`. Gates: cargo 66/66
  + 5 live smokes (iTunes "vergecast" and the video smokes green), vitest
  160/160, tsc clean, Playwright 25/25. Gemini review of the diff: no findings.
  NEW known gap (discovered during 2e, deliberately not fixed there — scope):
  **podcast episodes cannot play in the real backend** — `stream_episode` never
  consults the episode's `audio_url` enclosure, so yt-dlp receives the RSS guid
  and fails (e2e only passes because the mock returns `audio_url`; waypoint
  `podcast-episodes-cannot-play`). Plan with receipts:
  `docs/plans/2026-10-23-2e-podcast-search-ui.md`.
- **Step 2f done (2026-10-23, GLM 5.3 Flash free session):** search no longer
  fails open — a store failure after a source returned results now surfaces as
  the command's Err (the WARN-and-continue was how the 2d FK bug became a
  silent "no results"; the store error carried the diagnosis). The
  post-resolution tail is extracted into `search_episodes_resolved`, tested
  offline against the injected 2d incident state (migrations + FK, then
  `DELETE FROM users` — a fault fixture; the real migrations-only install now
  stores fine since 2d). The designed offline degradation (source fails →
  nothing to store → local read) is unchanged. Commit `3a10d332`. Gates:
  cargo 67/67, vitest 160/160, tsc clean, Playwright 25/25. Gemini review: no
  finding survived triage. Plan with receipts:
  `docs/plans/2026-10-23-2f-search-fails-closed.md`.
- **Step 2g done (2026-10-23, GLM 5.3 Flash free session):** the instance tier
  is back. Root cause of "every search falls back to yt-dlp": the health probe
  used the Invidious path (`/api/v1/videos/test`) for BOTH instance types — it
  404s on the Piped default (live-checked: that host answers `/search` 200 in
  1.5 s while the probe path 404s), so the only seeded instance sat in
  `Failed`, `order_for_search` silently dropped it, and the health task logged
  `Failover failed` every 5 minutes. The probe is now type-aware (Piped → its
  own `/search` endpoint with the `items` JSON marker; Invidious unchanged),
  both silent search branches log (no candidates WARN; empty answer INFO;
  fallback INFO), and `DEFAULT_INSTANCES` gains `api.piped.private.coffee`
  (live-verified 2026-10-23; kavin.rocks 502, adminforge 301, drgns.space dead
  the same day). Seed-if-empty semantics unchanged: existing installs heal via
  the probe fix; the second default lands on fresh installs. Commit
  `cbcd38b8`. Gates: cargo 71/71 + 6 live smokes (new probe smoke green
  against the real host), vitest 160/160, tsc clean, Playwright 25/25. Gemini
  review: no findings. Plan with receipts:
  `docs/plans/2026-10-23-2g-silent-fallback-fix.md`.
- **Step 2h done (2026-10-23, GLM 5.3 Flash free session):** thumbnails
  measured, not guessed. (a) 11/62 NULL rows are all pre-`e78274da` video rows
  and self-heal via the shipped backfill; (c) lazy loading already present.
  The live issue was (b): the parser's `max_by_key` picked the signed
  720-wide variant (60–220 KB) where the same yt-dlp list carries a properly
  16:9-cropped 360-wide variant (24 KB) — a 50-card search pulled 3–11 MB,
  which IS "the first few thumbnails arrive, the rest take seconds".
  `pick_card_thumbnail` now takes the smallest variant ≥ 300 px, else the
  largest below; the 2d widest-variant test is superseded (rewritten with its
  rationale), and the live capture is committed as a fixture. Stored rows
  keep their 720 URLs until re-returned (non-clobbering); new searches
  improve immediately. Commit `bd550f42`. Gates: cargo 71/71 + 6 live smokes,
  vitest 160/160, tsc clean, Playwright 25/25. Gemini review: no findings.
  Plan with receipts: `docs/plans/2026-10-23-2h-thumbnail-variant.md`.

## Step 1 — Fix search (blocks everything else)

Right now the app has nothing real to search or play.

- **1a. Start the background tasks.** Five tasks are created at startup but never
  actually run (`src-tauri/src/background_tasks/mod.rs`): server health checks, smart
  linking, feed fetching, SponsorBlock sync and cleanup. Rust warns about this on every
  build.
- **1b. Connect search to a real source.** The code that talks to the free YouTube
  front-ends (Invidious/Piped) and the video lookup code exist but are flagged as never
  used. Search needs to go through them, with fallback to another server when one is
  down.
- **1c. Podcast search and subscriptions.** The RSS feed reader and OPML import/export
  exist but are unused. Podcast search needs a directory, such as Apple's iTunes Search
  API or Podcast Index, plus subscribe and refresh.
- **1d. Smart links on real data.** Check the video-to-podcast pairing, and the
  per-title play mode (video or audio by default), against the three test shows:
  Vergecast, Some More News / Even More News, and Power User.
- **1e. Clean up and harden.** Clear the remaining ~30 build warnings (1a's fix already
  cleared five), look into the one flaky test, and add tests that use recorded real
  responses for search. Dependency hygiene (owner request 2026-10-19): all four
  future-incompatible crates in the build note (`buf_redux`, `multipart`, `quick-xml
  0.17`, `typemap`) trace to two **unused** direct dependencies — `multipart = "0.18"`
  (zero source references; drags in the abandoned iron/nickel/plugin stack via its
  default server feature) and `atom_syndication = "0.8"` (only mention is a comment at
  `podcast/mod.rs:104`; Atom is hand-parsed). Removing both Cargo.toml lines retires the
  whole warning class; a first audit pass on 2026-10-19 also found `axum` (with
  ws/json/multipart features) completely unused in source — same removal candidate.

## Step 2 — Frontend evaluation

- **2a.** A design audit against the brand, using `frontend-design` and
  `ui-theme-designer`: fonts, sizing, colours, spacing, how components behave in each
  state, and anything that looks like a generic template.
- **2b.** Accessibility: keyboard use, focus order, contrast, reduced motion, and
  screen-reader labels.
- **2c.** Real content will expose layout gaps: long titles, missing thumbnails, empty
  and error screens, and slow servers.
- **2d.** Native Mac polish: the menu bar, media keys and Now Playing (the media plugin
  is already loaded), and the window remembering its size and position.

## Step 3 — iPhone port — DEFERRED (decision 1)

- **3a. Tauri can build for iOS, but it needs an Apple Developer account ($99 a year),
  Xcode setup and app signing. — ADJUSTED:** TestFlight itself requires the paid Apple
  Developer Program membership; there is no free tier, so staying on TestFlight does
  **not** avoid the fee. Free provisioning (a "personal team") can only install directly
  on the owner's own registered devices, and those builds expire after 7 days — fine for
  the owner, not usable to give the app to others. Options until the membership exists:
  defer mobile and consider Android later (Google Play is a one-time $25; sideloading
  APKs is free; Tauri 2 supports it), or sideload iOS builds to the owner's own devices
  with the 7-day resign ritual. Once the membership is bought, **TestFlight-only
  distribution is the agreed strategy** — App Store rejection risk then stops mattering.
- **3b.** The iPhone layout needs a tab bar at the bottom instead of the sidebar, touch
  targets of at least 44pt, room for the notch and home bar, and replacements for
  anything that only works on hover.
- **3c.** Playback on iPhone needs extra work: audio continuing in the background and on
  the lock screen, and picture-in-picture for video.
- **3d.** App Store review is the biggest risk. Apple regularly rejects apps that play
  YouTube content without going through YouTube's own player. Check this with a small
  TestFlight build early, before investing in the full port.
- **3e.** Get it running on TestFlight and test on a real device.

## Step 4 — Everything else for a first public release

- **4a. Legal and licensing:** a privacy policy, the open-source licence, attribution
  for the APIs used (SponsorBlock, Invidious/Piped), and a clear statement that the app
  isn't affiliated with YouTube or podcast publishers.
- **4b. Name check:** EchoPrism.com is taken, so confirm the name is free on the app
  stores and GitHub (already on the owner's list).
- **4c. Signing — ADJUSTED (decision 2):** no signing identity exists, and the owner
  wants open-source distribution without one. The routes, in parallel:
  1. **Build from source** — a script that clones and builds locally, which makes
     signing a non-issue for source users.
  2. **Homebrew cask** from the owner's own GitHub tap.
  3. **GitHub Releases download** — unsigned binaries, with the one-line Gatekeeper
     first-launch note (right-click → Open, or `xattr -cr`) documented in the README.
  
  **Updates:** Tauri's built-in auto-updater requires signed update artifacts, so
  locally built copies cannot self-update. Until a signing identity exists, the app (or
  the update script) checks the latest GitHub release tag and prompts to re-run the
  build/update script. If a signing identity is ever obtained: notarise the app and
  enable the auto-updater.
- **4d. Updates — ADJUSTED:** stays on the 4c arrangement (release-tag check + re-run
  script) until a signing key and release channel exist.
- **4e. Distribution:** a GitHub Releases page with automated builds, and possibly the
  Mac App Store later.
- **4f. Crash reporting — ADJUSTED (decision 3):** if crash reports are collected at
  all: opt-in, stripped of personal data, uploaded to a place a GitHub Action can read;
  the Action deduplicates by stack signature and **files an issue automatically**
  (labelled `crash`). The owner reads GitHub issues only — never raw reports — and fixes
  what is filed.
- **4g. Wider testing:** a beta with a few outside users, and a Playwright end-to-end
  pass over every user flow.
- **4h. Launch materials:** README, screenshots and a landing page. The `replica-launch`
  skill in this repo covers this.

## Definition of the first release

The first public release is realistic once steps **1**, **2a–2c** and **4a–4e** are
done. The iPhone app (step 3) follows as version 1.1, deferred per decision 1; the
TestFlight check in 3d can run alongside the rest once a developer membership exists.

## Next action

Follow `docs/plans/2026-10-22-handoff-glm-flash.md`. Items 1–4 are DONE
(2e podcast search/subscribe from the UI; 2f store failures surface; 2g the
health-probe fix that reconnects the instance tier; 2h the card-appropriate
thumbnail variant). NEXT: step 4 — 4b name check; 4c/4d/4e delivery routes
(build-from-source installer, Homebrew cask in the owner's tap, GitHub
Releases workflow — everything prepared, nothing pushed/tagged/published
until the owner says so). NEW blocker-quality gap from 2e: podcast episodes
cannot play in the real backend (waypoint `podcast-episodes-cannot-play`) —
fix before or with the first release, since the new subscribe flow surfaces
those episodes. Known gaps carried forward: a light theme does not exist
(2a), the Cross-device sync toggle writes a field nothing reads, the Search
screen's Retry button is dead (`onClick={() => {}}` — more visible now that
2f makes real errors reach it). Future feature (owner, 2026-10-22, after the
first release unless reprioritised): play preview on hover for thumbnails.
