# 2026-11-03 live-run fixes, round 2 — Implementation Plan

> **For agentic workers:** execute task-by-task, test-first (red → green). Branch `fix/2026-11-03-round-2`, ship v0.1.5 via rtc-ship + cask bump.

**Goal:** Fix the four defects the owner hit on v0.1.4: audio-only stream errors, audio-only dropped on smart-link version switch, podcast video enclosures unread, logo white beam dimmed in audio-only — plus the matcher still asking confirmation on obvious branded/livestream-suffixed titles.

**Root causes (verified live 2026-11-03):**
- Piped `/streams` returns `audioStreams: []` (PO-token gating; confirmed on the live instance AND in the committed fixture `piped_streams.json`). `select_piped_stream(format="audio")` then errors → yt-dlp fallback returns a direct googlevideo URL with `headers: None` → WKWebView cannot load it → "Stream error" toast.
- `switchToLinked` (PlayerProvider.tsx:595) passes explicit mode `'video'` for video twins, which beats the audio-only toggle in `formatFor`.
- "Was jetzt? – Die Woche" feed (feed.podbean.com/wasjetzt-diewoche) serves `type="video/mp4"` enclosures, one per item, no audio enclosure — the RSS parser stores any enclosure into `audio_url` regardless of `type`, so video podcasts are misread as audio.
- `PrismConvergeToggle` sets `combinedOpacity = unified ? 1 : 0.25` — audio mode dims the white combined beam; owner wants only the orange video beams dimmed.
- Matcher: "X | The Vergecast" / "X | Livestream" already score 1.0 (v0.1.4 rule), but parenthesized forms "X (Livestream)" don't (parens aren't dividers) and multi-word tag segments without channel metadata don't.

## Tasks

### Task A — audio-only stream: fall back to combined video streams
**Files:** `src-tauri/src/extractor/mod.rs` (PipedStreamEntry += `video_only: Option<bool>`; `select_piped_stream` ~line 489)
- When `want_audio` and `audio_streams` is empty (or all filtered out), fall back to `video_streams` filtered to `!video_only.unwrap_or(false)` and format not HLS/DASH (an `<audio>` element plays the audio track of an mp4 but not HLS manifests); pick max quality rank as today. If both empty → Err (yt-dlp last resort unchanged).
- Tests: fixture `piped_streams.json` (audioStreams empty, videoStreams = LBRY MP4 + LBRY HLS + 360p MPEG_4 proxy) → `select_piped_stream(_, Some("audio"), None)` returns the 360p MPEG_4 URL; synthetic audioStreams present → audio list wins; all-videoOnly video list → Err.

### Task B — smart-link switch must respect the audio-only toggle
**Files:** `src/components/PlayerProvider.tsx:595`; `src/__tests__/smart-link-switch.test.tsx`
- `playRef.current(twin, hasVideoStream ? 'video' : 'audio')` → pass `undefined` when the twin has video (toggle decides via `formatFor`), keep `'audio'` for podcast twins.
- Test: `isAudioMode: true`, play linked podcast ep, tap switch → `stream` last called with `(twinId, 'audio')` and `playbackFormat === 'audio'`. Existing test (audio off → 'video') stays green.

### Task C — podcast video enclosures read as video
**Files:** `src-tauri/src/podcast/mod.rs` (PodcastEpisode += `video_url`; RSS parser checks `enclosure.mime_type` starts_with "video/" → video_url else audio_url; JSON-feed attachments mediaType likewise); `src-tauri/src/db/queries.rs:387` (INSERT += video_url + bind); `src-tauri/src/commands/episodes.rs` `enclosure_stream_for` (~line 200): if no video_id → audio_url as today, else video_url → `StreamInfo { url, format: "video" }` (the audio element still plays an mp4's audio track when audio-only is on).
- Tests: RSS fixture with a `video/mp4` enclosure → video_url set, audio_url None; existing Vergecast audio fixture unchanged; `enclosure_stream_for` video_url fallback.

### Task D — audio-only dims only the orange video beams, not the white combined beam
**Files:** `src/components/player/PrismConvergeToggle.tsx` (`combinedOpacity={unified ? 1 : 0.25}` → `mode === 'video' ? 0.25 : 1`); `src/__tests__/prism-converge-toggle.test.tsx`
- Update the "combined beam lights only in unified" test to the reversed expectation (owner correction 2026-11-03, comment records it): in audio mode / audioOnly, `mark-combined` opacity is 1; video beams pale as before.

### Task E — matcher: parens as branding dividers + livestream/live tag words
**Files:** `src-tauri/src/matcher/mod.rs`
- `BRANDING_DIVIDERS` += `'(' ')' '[' ']'`; `looks_like_branding` also true when every content word of the segment is in `{"livestream", "live"}`.
- Tests: "X (Livestream)" vs "X" → 1.0; "X | The Vergecast Livestream" vs "X" with channel "The Verge" → 1.0; guards (unrelated multi-word segment, one-word titles) stay < 1.0 / ≤ 0.5.

### Task F — verify + ship v0.1.5
- Full gates: `cargo test --workspace`, `npx vitest run`, `tsc --noEmit`, eslint.
- Bump 0.1.4 → 0.1.5 in `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `CHANGELOG.md` (new entry; note the matcher/icon reversals vs 0.1.3/0.1.4 where relevant).
- Ship via `rtc-ship.sh` from a detached worktree (symlink/copy node_modules untracked entries — the repo tracks most of node_modules; restore tracked, copy the ~17 untracked top-level entries from the main checkout), verify tag via ls-remote, wait for the release dmg, bump `Casks/echoprism.rb` sha256, verify via `gh api`.
- Update waypoint `echoprism-release-roadmap`.
