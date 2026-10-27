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

1. **A network whose IPv6 is permanently broken** must not cost a wait on every launch: the remembered verdict starts playback on IPv4 immediately, and the background probe never blocks a play. (Task 1: `persisted_broken_starts_on_ipv4`, `unknown_then_probe_flips_broken_restarts_inflight`.)
2. **A stream that never resolves** (wedged binary, both paths dead) must end in a visible error toast, never an endless spinner. (Task 1: the 60 s safety ceiling ⇒ Err.)
3. **Episodes whose channel row is gone** (deleted) must still render, with the old "Unknown channel" fallback, not crash. (Task 2 test.)
4. **Previous at the first queue item / Next at the last** must be no-ops (buttons disabled), not wrap or throw. (Task 8 test.)
5. **A podcast item without its own `itunes:image`** gets the channel image; a feed with neither keeps the headphones fallback. (Task 9 test.)

---

### Task 1: Video resolution — remembered IPv6 verdict, background probe, no gating timeout

**Cause (measured):** on the owner's network IPv6 to youtube.com/googlevideo never connects; Happy-Eyeballs clients fall back in 0.5 s, yt-dlp does not, and `get_stream_with_yt_dlp` (`src-tauri/src/extractor/mod.rs:224`) has no timeout ⇒ endless "loading".

**Owner correction (2026-10-27 11:19):** a timeout must never gate playback. On a network where IPv6 is permanently broken, a "try v6, wait, retry v4" design costs the full wait on every launch. The verdict is LEARNED once, REMEMBERED across launches, and kept current by a BACKGROUND probe; playback reads the current verdict and never waits for the probe.

**Files:** Create `src-tauri/src/netpath.rs` (verdict + probe); modify `src-tauri/src/extractor/mod.rs` (all yt-dlp call sites), `src-tauri/src/lib.rs` (spawn the probe at setup, manage state), no DB change: the verdict is a cached MEASUREMENT, not a user preference, so it lives in `<app_data_dir>/net-state.json` (`{"ipv6_youtube":"works|broken","measured_at":"<rfc3339>"}`) — `user_preferences` is a typed-column table. Tests in `netpath.rs` and `extractor/mod.rs`.

**Interfaces:**
- `pub enum Ipv6Verdict { Unknown, Works, Broken }`; `pub struct NetPath { tx: tokio::sync::watch::Sender<Ipv6Verdict> }` with `fn current(&self) -> Ipv6Verdict`, `fn subscribe(&self) -> watch::Receiver<Ipv6Verdict>`, `fn set(&self, v: Ipv6Verdict)` (also persists to `net-state.json`; write via temp file + rename; a missing or unparseable file loads as `Unknown`, never an error).
- Startup: `NetPath::load(state_path: PathBuf)` seeds from the persisted value (absent ⇒ `Unknown`), then `tokio::spawn(probe_loop)` — non-blocking.
- `async fn probe_ipv6(host: &str, timeout: Duration) -> Ipv6Verdict`: resolve AAAA for `www.youtube.com`, `TcpStream::connect` to the first v6 address within **3 s**; connect ⇒ `Works`, no AAAA / error / timeout ⇒ `Broken`. Runs at launch and again after any yt-dlp failure (debounced: at most once per 60 s).
- `fn force_ipv4(v: Ipv6Verdict) -> bool` = `v == Broken`. `Unknown` uses the default path (dual-stack).
- `fn yt_dlp_net_args(force_ipv4: bool) -> Vec<String>`: `["--socket-timeout","15"]` always, plus `"--force-ipv4"` when true. Every yt-dlp invocation (stream, search, storyboard) prepends these.
- Policy `run_yt_dlp(netpath, args) -> Result<Output, String>`: start with `force_ipv4(current)`. If running WITHOUT `-4`, `tokio::select!` the child against `rx.changed()`: a flip to `Broken` mid-flight kills the child and restarts immediately with `-4` (no waiting out a timeout). A non-success exit without `-4` ⇒ trigger a probe and retry once with `-4`. Children `kill_on_drop(true)`; a hard ceiling of 60 s per attempt exists only so a wedged binary cannot hang forever — it is a safety net, never the path a broken network takes.

- [ ] Step 1: tests — `net_args_add_force_ipv4_only_when_broken`; `persisted_broken_starts_on_ipv4` (seeded Broken ⇒ first invocation has `-4`, exactly one invocation); `unknown_then_probe_flips_broken_restarts_inflight` (stub runner that blocks; flip the watch ⇒ the blocked attempt is dropped and a `-4` attempt starts, total elapsed ≪ ceiling); `failure_without_v4_retries_once_with_v4`; `probe_unreachable_v6_is_broken` (connect to a non-routable v6 address e.g. `[100::1]:443` with a 300 ms timeout ⇒ Broken); `set_persists_and_reloads`.
- [ ] Step 2: run, expect FAIL. Step 3: implement; route stream, search and storyboard yt-dlp calls through `run_yt_dlp`. Step 4: `cargo test` green, `cargo build` zero warnings.
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
- **Interfaces:** context `next(): void`, `previous(): void`, `restart(): void`, `hasNext: boolean`, `hasPrevious: boolean`. **Owner decision (2026-10-27 11:20): `previous()` ALWAYS plays the prior item, at any position — deliberately NOT the common "restart if past 3 s" behaviour. Restarting is its own button, `restart()` (seek to 0, keep playing).** Next/previous go through the same resolve path as auto-advance (D7 play mode applies). Next/Previous disabled when `!hasNext` / `!hasPrevious` (Review Focus 4); Restart enabled whenever something is loaded.
- [ ] Tests: next plays item 2; **previous at 10 s into item 2 plays item 1 (not a restart)** — the discriminant for the owner decision; restart at 10 s seeks to 0 on the same item; Next/Previous disabled at the ends. Fail → implement → pass → commit + push.

### Task 9: Podcast cover art

**Cause:** `src-tauri/src/podcast/mod.rs:116` hard-codes `thumbnail_url: None` ("itunes_image not available" — false; the `rss` crate exposes `itunes_ext().image()`). 0 of 1,102 podcast episodes have art; the Vergecast feed publishes `<itunes:image>`.

**Files:** `src-tauri/src/podcast/mod.rs` (channel + item parse; refresh path fills `thumbnail_url` where NULL), `src/components/feed/EpisodeCard.tsx` (fallback `episode.thumbnail_url ?? episode.channel?.thumbnail_url`, needs Task 2); tests: Rust parse fixture + `podcast-fallback-icon.test.tsx` extension.
- [ ] Rust tests `parse_reads_channel_itunes_image`, `item_without_image_inherits_channel_image`, `refresh_backfills_missing_art_only` (never overwrites existing art). Vitest: card uses the channel image when the episode has none; headphones only when neither exists (Review Focus 5). Fail → implement → pass → commit + push. Owner action: press Refresh once to backfill.

### Task 10: Clickable channels with avatars

**Files:** new route `/channels/:id` (`src/components/screens/ChannelScreen.tsx`, router + `ChannelCard` link), episodes via existing `episodeCommands.feed({ channelId })`; avatar: new Rust command `resolve_channel_avatar(channel_id) -> Option<String>` (podcast: feed image from Task 9; video: Invidious `/api/v1/channels/{ucid}` `authorThumbnails`, yt-dlp fallback via the Task 1 policy), stores `channels.thumbnail_url` when NULL; Channels screen requests avatars for rows missing one, at most 4 concurrently.
- [ ] Tests: card click navigates to `/channels/:id`; channel screen lists that channel's episodes only; avatar shown when `thumbnail_url` set, initials placeholder otherwise; Rust parse test for `authorThumbnails` picking the ≥88 px entry. Fail → implement → pass → commit + push.

---

**Zero local-offload steps, stated at plan level (Credit Efficient Mode):** every task changes live multi-layer code and must run against the repo's toolchain inside this session; the transformation-over-many-similar-inputs shape that qualifies for dispatch does not occur here.
