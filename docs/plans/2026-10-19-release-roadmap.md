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

Step 1d — smart links on real data: check the video-to-podcast pairing and the
per-title play mode against Vergecast, Some More News / Even More News and Power User,
now that both search (1b) and podcast subscriptions (1c) produce real rows. The
playback-while-closed check from the close-to-Dock verification can also be re-run.
