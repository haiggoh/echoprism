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
  Dock, Cmd+Q quits (`b7c68bda`). Needs a quick manual check (`npm run tauri dev`,
  close window, click Dock icon).
- Nothing pushed yet.

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
- **1e. Clean up and harden.** Clear the 35 build warnings, look into the one flaky
  test, and add tests that use recorded real responses for search.

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

Step 1a — wire the five background tasks into app startup so they actually run.
