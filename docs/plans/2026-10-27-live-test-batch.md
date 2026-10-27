# Live-test batch (2026-10-27) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the nine defects and gaps the owner hit in a live `tauri dev` test on 2026-10-27, smallest first.

**Architecture:** Each task is an independent vertical fix (Rust command/query + TS binding + UI + test) committed and pushed on its own. Root causes were measured before planning against the owner's real DB (read-only) and network; each task states its cause.

**Tech Stack:** Tauri 2, Rust (sqlx/SQLite, `rss` crate, tokio), React + TanStack Query, Vitest, mock router (`src/mocks/router.ts`) as the browser backend.

**Spec:** the owner's two live-test reports in session 0ab7959b (2026-10-27 10:52 and 11:05 CET) plus the decisions below. No separate design doc.

## Global Constraints

- Owner decisions (2026-10-27): IPv6 = **app retries on IPv4** after a timeout/failure, plus a router note to the owner; unsubscribed channels are **hidden, never deleted**; run all tasks smallest-first, commit + push each.
- Every new Rust command gets a TS binding in `src/hooks/useTauriCommands.ts`, a mock in `src/mocks/router.ts`, and passes `src/__tests__/tauri-command-contract.test.ts`.
- **Mock parity:** whatever shape the real command returns, the mock returns — and vice versa. Three of today's bugs were mock-satisfied, real-broken.
- Gates per task: `./node_modules/.bin/tsc --noEmit` clean, `./node_modules/.bin/vitest run` all green, `cargo test` (src-tauri) green, `cargo build` with **zero warnings**. Use `node_modules/.bin`, never `npx` (resolves a global tsc).
- Never write to the owner's real DB (`~/Library/Application Support/app.echoprism/`); tests use temp DBs.
- Commits staged by path; `node_modules/.package-lock.json` is never staged.

## Review Focus

1. **Video on a healthy dual-stack network** must not get slower: the IPv4 retry fires only after the first attempt fails or times out. (Task 1 test: first attempt succeeds ⇒ exactly one invocation.)
2. **A stream that never resolves** must end in a visible error toast, never an endless spinner. (Task 1: timeout ⇒ Err.)
3. **Episodes whose channel row is gone** (deleted) must still render, with the old "Unknown channel" fallback, not crash. (Task 2 test.)
4. **Previous at the first queue item / Next at the last** must be no-ops (buttons disabled), not wrap or throw. (Task 8 test.)
5. **A podcast item without its own `itunes:image`** gets the channel image; a feed with neither keeps the headphones fallback. (Task 9 test.)

---

### Task 1: Video resolution — timeout + IPv4 retry

**Cause (measured):** on the owner's network IPv6 to youtube.com/googlevideo never connects; Happy-Eyeballs clients fall back in 0.5 s, yt-dlp does not, and `get_stream_with_yt_dlp` (`src-tauri/src/extractor/mod.rs:224`) has no timeout ⇒ endless "loading".

**Files:** Modify `src-tauri/src/extractor/mod.rs` (`yt_dlp_stream_args`, `get_stream_with_yt_dlp`, `search_with_yt_dlp`, `storyboard_with_yt_dlp`). Tests in the same file's test module.

**Interfaces:**
- Produces: `fn yt_dlp_stream_args(video_id: &str, format: Option<&str>, force_ipv4: bool) -> Vec<String>` (adds `--force-ipv4` and `--socket-timeout 15` when `force_ipv4`); `const YT_DLP_ATTEMPT_SECS: u64 = 25;`
- Policy: `run_yt_dlp_with_ipv4_retry(args_for: impl Fn(bool) -> Vec<String>) -> Result<Output, String>` — attempt 1 without `--force-ipv4` under `tokio::time::timeout(YT_DLP_ATTEMPT_SECS)`; on timeout OR non-success, attempt 2 with it; both fail ⇒ `Err("yt-dlp could not resolve the stream (tried IPv6/IPv4): …")`. Child is killed on timeout (`kill_on_drop(true)`).

- [ ] Step 1: tests `stream_args_force_ipv4_adds_flag` (flag present only when true) and `ipv4_retry_runs_second_attempt_only_after_failure` — drive the policy with a stub runner closure counting calls: success-first ⇒ 1 call; fail-first ⇒ 2 calls, 2nd args contain `--force-ipv4`; both fail ⇒ Err.
- [ ] Step 2: run, expect FAIL. Step 3: implement; route the stream, search and storyboard yt-dlp calls through the policy. Step 4: `cargo test` green, `cargo build` zero warnings.
- [ ] Step 5: manual probe: `yt-dlp -4 -g <vergecast id>` resolves (already measured: 206 over v4).
- [ ] Step 6: commit + push. Tell the owner the router note (FritzBox IPv6 to Google is black-holed; every non-Happy-Eyeballs tool on the Mac hangs the same way).

### Task 2: Episodes carry their channel ("Unknown channel")

**Cause:** Rust `Episode` (`src-tauri/echoprism-core/src/types.rs:419`) has no `channel`; the mock attaches one (`src/mocks/router.ts:60,73`). Mini-player/queue/feed read `episode.channel?.title`.

**Files:** Modify `echoprism-core/src/types.rs`, `src-tauri/src/db/queries.rs` (`get_feed`, `get_episode`, and every query returning `Episode` to the player: queue items), test in `queries.rs` tests.

**Interfaces:**
- Produces: `pub struct EpisodeChannel { pub id: String, pub title: String, pub thumbnail_url: Option<String>, #[serde(rename="type")] pub channel_type: ChannelType }`; `Episode.channel: Option<EpisodeChannel>` (`#[serde(skip_serializing_if = "Option::is_none")]`, `#[sqlx(skip)]` or hydrated after fetch). TS `Episode.channel` gains `type`.
- Hydration: one batched `SELECT id,title,thumbnail_url,type FROM channels WHERE id IN (…)` per result set (no N+1).

- [ ] Step 1: Rust test `feed_episodes_carry_channel_title` (temp DB, one channel + episode ⇒ `channel.title` set) and `episode_with_missing_channel_has_none` (Review Focus 3).
- [ ] Steps 2–4: fail, implement, pass. Step 5: commit + push.

### Task 3: History screen shows new plays

**Cause:** global `staleTime` 5 min (`src/main.tsx:14`) and `historyCommands.record` (`src/components/PlayerProvider.tsx:196`) never invalidates `['history']`; recording itself works (1 row written 09:58 UTC).

**Files:** Modify `src/components/PlayerProvider.tsx`; test `src/__tests__/history-refresh.test.tsx`.
- [ ] Step 1: test: render provider + HistoryScreen sharing one QueryClient, load history (empty), trigger a successful play, assert the played title appears without remount. Steps 2–4: fail (cached empty), invalidate `['history']` in the record `.then`, pass. Also log (console.warn) instead of swallowing a record failure. Step 5: commit + push.

### Task 4: Channels lists subscriptions only; Unsubscribe is real

**Cause:** 103 `is_subscribed=0` video channels (saved by search) are listed; `unsubscribe` (`src-tauri/src/commands/channels.rs:216`) is a stub.

**Files:** Modify `src-tauri/src/commands/channels.rs`, `src-tauri/src/db/queries.rs` (`list_channels`), `src/mocks/router.ts`; tests in Rust + `src/__tests__/channels-subscribed.test.tsx`.
- **Interfaces:** `ChannelListParams.subscribed_only: Option<bool>` (serde `subscribedOnly`, default **true**); `unsubscribe(db, channel_id: String)` sets `is_subscribed=0, subscribed_at=NULL`, Err if no row.
- [ ] Rust tests `list_channels_defaults_to_subscribed`, `unsubscribe_clears_flag` (+ unknown id ⇒ Err). Vitest: Channels screen hides an unsubscribed fixture; clicking Unsubscribe removes the row. Fail → implement → pass → commit + push. No rows are deleted.

### Task 5: Smart Links show titles

**Cause:** `src/components/smartlinks/SmartLinksPanel.tsx:100` prints `{podcast_guid} ↔ {youtube_video_id}`.

**Files:** Rust smart-links list command + query (join `episodes` on `podcast_guid` and on `video_id`), TS type, mock, panel; test `src/__tests__/smart-links-screen.test.tsx` (extend).
- **Interfaces:** link rows gain `podcast_title: Option<String>`, `video_title: Option<String>`, `podcast_channel: Option<String>`, `video_channel: Option<String>`.
- [ ] Test: panel shows both titles and NOT the raw guid when titles exist; falls back to the id (monospace, muted) when a side has no local episode. Fail → implement → pass → commit + push.

### Task 6: Tauri capabilities (menu playback events)

**Cause:** crash log `event.listen not allowed … core:event:allow-listen`; no `src-tauri/capabilities/`. Breaks `src/hooks/useMenuPlayback.ts`.

**Files:** Create `src-tauri/capabilities/default.json` (`"windows": ["<main window label from tauri.conf.json>"]`, `"permissions": ["core:default"]`).
- [ ] Verify `cargo build` (tauri-build validates capabilities), app starts, and `crash-reports.jsonl` gains no new `event.listen` line after a `tauri dev` launch + menu Play/Pause (owner-verify step; record result). Commit + push.

### Task 7: Playback speed

**State:** `playbackRate` exists in `PlayerProvider` (line 22, applied to audio only at :317); no control, not applied to video.

**Files:** `src/components/PlayerProvider.tsx`, new `src/components/player/SpeedControl.tsx`, mini/full player; test `src/__tests__/playback-speed.test.tsx`.
- **Interfaces:** `PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const`; context `setPlaybackRate(rate: number): void`; persisted in `localStorage['echoprism.playbackRate']`; applied to BOTH the audio and video elements, and re-applied on source change (media elements reset rate on load).
- [ ] Tests: selecting 1.5× sets `playbackRate` on the active media element; survives an episode change; restored from storage on mount. Fail → implement → pass → commit + push.

### Task 8: Queue next / previous

**Files:** `src/components/PlayerProvider.tsx` (reuse the D7 auto-advance path, `src/lib/playModeChain.ts`), player controls; test `src/__tests__/queue-navigation.test.tsx`.
- **Interfaces:** context `next(): void`, `previous(): void`, `hasNext: boolean`, `hasPrevious: boolean`. `previous()` restarts the current item when position > 3 s, else plays the prior item. Next/previous go through the same resolve path as auto-advance (D7 play mode applies). Buttons disabled when `!hasNext` / `!hasPrevious` (Review Focus 4).
- [ ] Tests: next plays item 2; previous at 10 s restarts item 2; previous at 1 s plays item 1; both disabled at the ends. Fail → implement → pass → commit + push.

### Task 9: Podcast cover art

**Cause:** `src-tauri/src/podcast/mod.rs:116` hard-codes `thumbnail_url: None` ("itunes_image not available" — false; the `rss` crate exposes `itunes_ext().image()`). 0 of 1,102 podcast episodes have art; the Vergecast feed publishes `<itunes:image>`.

**Files:** `src-tauri/src/podcast/mod.rs` (channel + item parse; refresh path fills `thumbnail_url` where NULL), `src/components/feed/EpisodeCard.tsx` (fallback `episode.thumbnail_url ?? episode.channel?.thumbnail_url`, needs Task 2); tests: Rust parse fixture + `podcast-fallback-icon.test.tsx` extension.
- [ ] Rust tests `parse_reads_channel_itunes_image`, `item_without_image_inherits_channel_image`, `refresh_backfills_missing_art_only` (never overwrites existing art). Vitest: card uses the channel image when the episode has none; headphones only when neither exists (Review Focus 5). Fail → implement → pass → commit + push. Owner action: press Refresh once to backfill.

### Task 10: Clickable channels with avatars

**Files:** new route `/channels/:id` (`src/components/screens/ChannelScreen.tsx`, router + `ChannelCard` link), episodes via existing `episodeCommands.feed({ channelId })`; avatar: new Rust command `resolve_channel_avatar(channel_id) -> Option<String>` (podcast: feed image from Task 9; video: Invidious `/api/v1/channels/{ucid}` `authorThumbnails`, yt-dlp fallback via the Task 1 policy), stores `channels.thumbnail_url` when NULL; Channels screen requests avatars for rows missing one, at most 4 concurrently.
- [ ] Tests: card click navigates to `/channels/:id`; channel screen lists that channel's episodes only; avatar shown when `thumbnail_url` set, initials placeholder otherwise; Rust parse test for `authorThumbnails` picking the ≥88 px entry. Fail → implement → pass → commit + push.

---

**Zero local-offload steps, stated at plan level (Credit Efficient Mode):** every task changes live multi-layer code and must run against the repo's toolchain inside this session; the transformation-over-many-similar-inputs shape that qualifies for dispatch does not occur here.
