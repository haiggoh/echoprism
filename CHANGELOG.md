# Changelog

All notable changes to EchoPrism are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
aims for [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The release workflow publishes the section for the pushed tag, verbatim —
this file is the release notes' single source.

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
