# Changelog

All notable changes to EchoPrism are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
aims for [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The release workflow publishes the section for the pushed tag, verbatim —
this file is the release notes' single source.

## [0.1.11] - 2026-11-05

### Fixed — YouTube playback "Stream error" (owner 2026-11-05 ~12:40, verified working in the dev build)

- Root cause measured live: yt-dlp's `-J` formats carry an `available_at` timestamp (~4 s after extraction), and googlevideo answers **403 to every request before it** (same URL: t+0 403, t+2…8 s 206). The resolver probed at once; the proxy's refresh re-extracted a *new* not-yet-available URL and retried at once (403 again). The 0.1.10 note "URLs expire within seconds" was this effect, read inverted. The resolver and the refresh path now wait for `available_at` (capped at 10 s) — the same wait yt-dlp's own downloader does ("Sleeping N seconds as required by the site"). Expect a ~4–6 s pause before YouTube playback starts.
- The visible error was a masking bug: with every real format 403ing, the candidate loop fell through to a **storyboard** "format" (scrubber sprites, `i.ytimg.com` `image/webp`); a 1-byte probe accepted it and WebKit was handed an image (MediaError 4). Storyboards are now excluded and a probe answered with `image/*` or `text/*` is rejected.
- Audio-only playback of YouTube stopped at exactly 5:00 (MediaError 2): the stream proxy had a 300 s *total* request timeout, and googlevideo throttles audio-only to ~2× playback rate (~32 KB/s), so one request streams for many minutes. The proxy now uses a 15 s connect + 60 s idle-read timeout.
- A proxy refresh keeps the format the stream started on instead of the top-ranked one.
- The media-error log line now carries `MediaError.code`, `networkState` and `readyState`.

Known, next: switching to audio-only restarts at 0:00 instead of the playhead; seeking in audio-only does not work.

Gates: cargo 188/188 (+5 new, each mutation-checked red; +1 live test, real yt-dlp → proxy → 206 video/mp4 2 MB and audio/mp4 256 KB), vitest 347/347, tsc clean, eslint clean.

## [0.1.10] - 2026-11-05

### Fixed — YouTube playback stuck / failing entirely (owner 2026-11-05 ~10:50)

- Root cause measured live: googlevideo stream URLs expire within seconds — a fresh URL answers 206 at 3.7 MB/s, the next one generated seconds later 403s instantly. A resolve-time probe cannot cover the webview's later load. The local stream proxy now takes a refresh callback (re-runs yt-dlp `-J` for a fresh URL+headers) and retries the in-flight request when the upstream answers 403/410. Delivery test: 403 → refresh → 206 with the fresh body. Live e2e (real yt-dlp → proxy → 200/206, 512 KiB streamed) green.

Gates: cargo 183/183, vitest 347/347, tsc clean, eslint clean, 0 build warnings.

## [0.1.9] - 2026-11-05

### Fixed — audio-only playback of YouTube videos (owner 2026-11-05)

- yt-dlp stream candidates are now PROBED (1-byte Range GET, through the local proxy when headers are present) and the first that answers 200/206 wins — live-measured: the same googlevideo format answered 403 on one edge and 206 on another within minutes, which is why audio-only still failed intermittently. Chosen host+status is logged.
- PlayerProvider discards a mid-flight resolve whose format was toggled (re-resolves for the new format) and logs the streamUrl on media-element errors.

Gates: cargo 182/182, vitest 347/347, tsc clean, eslint clean. Live e2e (real yt-dlp → proxy → 206) green.

## [0.1.8] - 2026-11-04

### Fixed

- Audio-only yt-dlp picks are progressive direct URLs only — an HLS manifest cannot play in an `<audio>` element (the "Seeking…" error loop). (Missed by the 0.1.7 tag; shipped here.)

## [0.1.7] - 2026-11-04

### Fixed — live-run round 4 (branch fix/2026-11-04-round-4)

- Matcher: stale links are re-scored on every Run Matching and DELETED when they no longer pass the gates (the 95% "iPhone X Review ↔ iPhone Duo review (emotional)" false positive from the char-fuzzy era disappears); certain pairs upgrade to 100%. Channel-name similarity is only a soft signal — channel LINKING still requires shared confirmed episodes. Branding segments strip only on the exact (podcast) channel name or livestream/live tags. Fixed a words_match arg-order bug in the word-level fuzzy.
- Audio-only yt-dlp picks are progressive direct URLs only (an <audio> element cannot play HLS manifests — the "Seeking…" loop).
- Smart-link matching fires on playback start (debounced 30 s) so the twin-switch button appears whenever a match exists.

Gates: cargo 181/181, vitest 347/347, tsc clean, eslint clean.

## [0.1.6] - 2026-11-04

### Fixed — live-run round 3 (branch fix/2026-11-04-round-3, 6 commits; owner run 2026-11-04 ~17:55 CET)

- Stream error root cause fixed properly: Piped `/streams` is 500-gated (verified live), so resolution fell to yt-dlp, whose googlevideo URLs need headers a media element cannot send. yt-dlp `-J` formats are now parsed and headered URLs are served through a new local 127.0.0.1 proxy that forwards Range and streams the body (seeking works). Audio-only of YouTube videos works again.
- Audio-only is a no-op for video-less episodes: the player stage no longer flips podcast episodes between the video branch and the art stage when the toggle changes; square podcast covers keep their shape.
- Podcast video enclosures: refresh moves a misfiled video/mp4 enclosure from audio_url to video_url ("Was jetzt? – Die Woche" verified live to publish video-only enclosures), so such episodes play as video.
- Matcher: word-level fuzzy matching ("iPhone X Review" vs "iPhone Duo review (emotional)" no longer pairs), branding segments must relate to a known channel or be livestream/live tags ("(emotional)" is content), a +/-2-day date hard gate when both dates are known, and unconfirmed links are re-scored on Run Matching (a stale 68% branded pair becomes 100% and auto-confirmed).
- Smart Links UI: 100% matches render in a collapsed group, expanded on demand.

Gates: cargo 180/180, vitest 346/346, tsc clean, eslint clean.

## [0.1.5] - 2026-11-03

### Fixed — live-run round 2 (branch fix/2026-11-03-round-2, 5 commits; owner report 2026-11-03 ~19:56 CET)

- Audio-only no longer errors: Piped's `audioStreams` are empty under PO-token gating (verified live), so format=audio fell through to a headerless googlevideo URL the webview cannot load. Audio now falls back to the best combined mp4 video stream, which plays in an `<audio>` element.
- Smart-link version switch respects the audio-only toggle (an explicit 'video' mode no longer overrides it).
- Podcast VIDEO enclosures are read: the enclosure mime type routes video/mp4 to `video_url` (verified live on "Was jetzt? – Die Woche", which publishes only video enclosures); such episodes play in the video element, and audio-only plays the mp4's audio track.
- Audio-only pales only the orange video beams in the logo — the white combined beam stays lit.
- Matcher: parentheses/brackets count as branding dividers ("X (Livestream)" vs "X" = 100%), and livestream/live tag words are branding; mutation-checked.

Gates: cargo 175/175, vitest 344/344, tsc clean, eslint clean.

## [0.1.4] - 2026-11-03

### Fixed — live-run fixes (branch fix/2026-11-03-live-run, 6 commits; owner run of bin/echoprism 2026-11-03 ~18:10 CET)

- Default instances are BACKFILLED on existing installs, not only seeded into an empty table — the 2026-11-03 run had only pipedapi.ducks.party (down from this network), so failover had nowhere to go. Existing rows are matched by url and never touched.
- The health loop no longer logs "Failover failed … No healthy instance available" as ERROR every 5 min: one warn per failure episode (recovery resets), repeats at debug; the failover decision now uses the health measured in the same tick.
- Stream resolution logs its yt-dlp fallbacks (no candidates / all instances failed) instead of going silent.
- Matcher recognizes the branding-suffix PATTERN, not only exact channel names: "X" vs "X | The Vergecast" is 100% certain even when channel names differ ("The Verge") or are missing; multi-word segments with no channel affinity stay content (guard tests pin both sides).
- The app icon keeps the prism mark in audio-only mode — the headphones overlay there was a mistake (reverses 0.1.3); the audio-only indicator lives on the player stage, where the cover art is.
- Audio-only stage shows the FULL-SIZED thumbnail (w-full, aspect-video), not a small square.
- Mini-player volume bar is a vertical slider popping above the mute button, clear of the play bar.

Gates: cargo 168/168, vitest 343/343, tsc clean.

## [0.1.3] - 2026-11-02

### Changed — live-test batch 4 (branch fix/live-test-batch-4-2026-11-02)

- Queue never holds the same episode twice — re-queuing moves it (play-next/end); Play now inserts AT the cursor.
- Two equal-size card buttons: Play now + a queue button following the Settings queue-behavior choice.
- Audio-only app icon is the headphones mark; the player stage shows cover art (podcast image or YouTube thumbnail) in audio-only mode.
- Smart-link switch relabelled: "Podcast version" / "YouTube version" — never "audio version" (podcasts carry baked-in ads).
- Matcher: same title + any divider + show branding (suffix or prefix) = 100% confidence; linked channels floor near-titles at 0.95.
- Seek errors during a timeline skip no longer kill playback; media preload="metadata" (podcast CDNs verified Range-capable: HTTP 206 + accept-ranges on a live 161 MB enclosure).
- Loading splash screen with pulsing logo + version.
- Gates: vitest 337/337, cargo 162, e2e 33/33, lint 0, tsc clean.

## [0.1.2] - 2026-11-02

### Changed — parity-audit batch 3 (branch fix/parity-audit-2026-11-02, 7 commits)

Owner decisions 2026-11-02 implemented: ONE global play bar (MiniPlayer is the
whole transport; PlayerScreen keeps stage + title; real Picture-in-Picture via
requestPictureInPicture), ONE audio-only state with exactly two controls (bar +
Header) persisted across launches via audio_only_default, and a predictable
card-click model (default: queue as play-next; real Play now inserts after the
cursor; legacy 'auto' rows migrate to 'queue'; style choosable in Settings).
Plus: update_settings accepts partial patches (the real app can now save a
preference), smart-link badge with one-tap switch to the linked version at the
same position, dead ui/EpisodeCard.tsx removed, two pre-existing e2e failures
fixed, playlists (0.1.1 work), hidden-channel retention cap (2000, oldest
pruned), real eslint gate. Gates: vitest 321/321, cargo 160, e2e 33/33, lint 0,
tsc clean. Parity re-audit: 100% scored rows, 5/5 must-haves (replica/parity.md).

## [0.1.1] - 2026-10-31

### Changed — credit-moment mark 📐 (emoji branding rollout, Task 18)

- `bin/echoprism` usage banner now leads with `📐 echoprism`; README h1 is
  `# 📐 EchoPrism`. App UI out of scope. Usage-error lines (`echoprism: unknown
  command`) stay unbranded. Pinned by src/__tests__/branding.test.ts (RED→GREEN,
  mutation-checked). Version 0.1.0 → 0.1.1 (package.json,
  src-tauri/tauri.conf.json, src-tauri/Cargo.toml + this file — synced
  2026-10-31; the release workflow derives the dmg name from tauri.conf.json).

## [0.1.0] - first public release

### Added

- **One library, two streams.** YouTube videos and podcast episodes live
  side by side; a queue and a player serve both, with the stream type
  visible on every card.
- **Smart links.** Episodes of the same story on both streams are paired
  automatically and can be reviewed, so switching streams keeps your place.
- **Podcast directory and subscriptions.** Search Apple's iTunes directory,
  subscribe, and the background refresh (30 minutes) brings new episodes —
  with a manual "Refresh now".
- **OPML import/export** for podcast subscriptions: import registers feeds
  without fetching (the refresh brings their episodes); export produces
  OPML 2.0 or JSON.
- **Episode notifications.** A real bell: the count is episodes published
  since you last looked, across subscribed channels.
- **OPML import during first-run setup.** The onboarding "Import
  Subscriptions" step's import control is wired to the same command the
  Settings → Podcasts tab uses: paste your OPML, and the feeds are registered
  (episodes arrive on the background refresh).
- **Hover previews.** Storyboard previews on video cards (Piped
  `previewFrames`, with the local yt-dlp storyboard as the fallback).
- **Play history** recording every playback, with titles, artwork and a
  jump back to the player.
- **Per-title-family play modes** (channel + title pattern → video or
  audio), chapter and SponsorBlock display, downloads, per-channel
  notification and format preferences.
- **Light and dark themes**, both contrast-measured to the same
  accessibility bar; the theme follows the system by default.
- **Native macOS integration**: a Playback menu, Now Playing and media keys
  through the W3C Media Session API, and window geometry restore.
- **Crash reports, opt-in and local-first**: panics and page errors are
  captured locally with personal paths stripped; filing one opens a
  prefilled GitHub issue in your browser — no automatic uploads, no tokens.

### Fixed

- Podcast episodes could not play: the stream resolver ignored the feed
  enclosure and sent the RSS guid to yt-dlp.
- On a real install, search results never persisted (the local user row was
  created only by test fixtures), so search always read back empty.
- Playback resolved with invalid yt-dlp selectors (`-f video`);
  now m4a for audio and the H.264 HLS master manifest for video.
- yt-dlp results stored no thumbnails, and stored ones used the heavy
  720-wide variant — a 50-card search pulled several MB; cards now use the
  360-wide crop (about 24 KB each).
- Search failures while storing results surfaced as a silent "no results";
  the error now surfaces.
- The instance health probe used an Invidious path for every instance type,
  marking the seeded Piped instance failed — every search silently fell
  back to yt-dlp. The probe now speaks each instance's own API, both silent
  fallback branches log, and a second live-verified default instance ships
  on fresh installs.

### Notes

- Builds are unsigned: Gatekeeper may block the first launch (right-click →
  Open, or `xattr -cr`). There is no auto-updater until a signing identity
  exists; `scripts/check-updates.sh` compares your build against releases.
- EchoPrism is an independent client, not affiliated with YouTube, Apple or
  any podcast publisher. See `docs/PRIVACY.md` and
  `THIRD-PARTY-NOTICES.md`.
