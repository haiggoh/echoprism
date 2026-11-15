# Browser-fast playback start — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this
> plan task-by-task (NATIVE: you implement every task yourself, then one final whole-branch
> review). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** YouTube playback starts browser-fast (pre-resolved ≤ 1.5 s, cold ≤ 5 s), audio-only is
never slower than video and never fetches video bytes, podcasts skip tracker redirects, video
uses capped adaptive HLS.

**Architecture:** Resolve playable URLs BEFORE the click (hover dwell + upcoming queue) into a
backend cache that only holds gate-passed, immediately playable entries; shrink the cold path
(per-capability instance health, polled `available_at` gate, fewer yt-dlp clients); serve video
as an HLS master playlist filtered by the local proxy; strip podcast tracker prefixes. A start-up
timer measures every play so each change is proven by numbers.

**Tech Stack:** Tauri 2 (Rust, tokio, reqwest, hyper proxy in `stream_proxy.rs`), React 18 +
Zustand + TanStack Query, vitest, Playwright (mocked backend), yt-dlp (`2026.10.26` observed).

**Spec:** `docs/plans/2026-11-15-streaming-startup-design.md` (commit `691d926f`) — read it
fully before Phase 0. It carries the measurements and every owner decision. This plan does not
repeat its rationale.

---

## 🚨 System instructions for the executor — read first

1. This plan is self-contained. You have no prior chat. Revalidate every path and line number
   below against the live source before editing (they are from commit `691d926f`).
2. Before ANY file edit, write exactly three sentences connecting Phase 0 to the final outcome.
   Then run Phase 0 (read-only) and record Receipt 0.
3. Work ONLY in the worktree `~/.wt/ep-startup` on branch `feat/startup-speed`. NEVER switch the
   branch of `~/ClaudeWorkspace/echoprism` (the canonical checkout: the dev launcher
   `~/.local/bin/echoprism` runs it as-is). Stage BY PATH; never `git add -A` / `git add .`.
4. Every task ends with a receipt: the exact command, its real output (trimmed, no secrets), exit
   code, and the invariant checked. "Not tested" is written as such, never as passed.
5. Every important behaviour has a discriminant: a known-bad fixture or isolated temporary mutation
   that turns its test RED before the good case counts as GREEN. Never plant faults in live files
   or services. Never weaken a test to make it pass — inspect the instrument instead.
6. A failure means STOP that task → diagnose (superpowers:systematic-debugging) → fix → rerun, and
   show both runs in the receipt.
7. **Network measurements on this machine MUST force IPv4** (`curl -4`, `yt-dlp --force-ipv4`):
   IPv6 to YouTube is blackholed here (bare `yt-dlp -J` = 183 s; `--force-ipv4` = 2.8 s). Python
   `urllib` is also polluted (10 s per request). Check `real` vs `user` time on any slow number.
8. **Offload verification per milestone** (owner instruction): after each task's own tests are
   green, dispatch an independent cross-check to a free model as a STATELESS dispatch —
   `free-agent-tool.py` (on PATH via the free-agents plugin; `--help` for usage) with
   `{"prompt": "<task section + acceptance>", "files": [<changed files>], "role": "validator"}`.
   For checks that must run commands, use a headless free session (`remote-session.sh <alias>
   --prompt-file <brief> -p`). Record `model_used` and `route` in the receipt. A free verdict is
   advisory; YOU confirm any finding against the source before acting on it.
9. Before EVERY commit, read memory `commit-attribution-by-model` (in
   `~/.claude/projects/-Users-bra0002h/memory/`) and add the trailer for the model you are
   running as, below `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
10. Never print process argv (`ps aux`, `pgrep -a`), keys or tokens in receipts.

## 🔒 Authority matrix

Highest granted boundary: **SHIP THROUGH RELEASE** (owner, 2026-11-15, this session).

| Operation | Status | Gate |
|---|---|---|
| Read-only inspection, live `curl -4` / `yt-dlp --force-ipv4` probes of public YouTube/podcast URLs | allowed now | ≤ ~30 yt-dlp runs per hour (bot-block risk) |
| Create worktree `~/.wt/ep-startup`, edit, local commits on `feat/startup-speed` | allowed now | Phase 0 receipt |
| Add a Rust crate / npm package | allowed after gate | pinned version, project-scoped, named in the task receipt |
| Push `feat/startup-speed` | allowed after gate | full Rust + vitest suites green |
| Merge to `master`, bump version, tag, GitHub release, refresh, dogfood | allowed after gate | Task 12 gate: all suites green, no known errors, ship via `rtc-ship.sh` |
| Moving/deleting a published tag, force-push, rewriting `master` | **prohibited** | fix forward as the next version |
| Editing `~/Library/Application Support/app.echoprism/*` (live DB, `net-state.json`) | **prohibited** | use temp dirs / in-memory DB in tests |
| Killing processes you did not start; restarting proxies on ports 4141-4151 / 8000-8010 | **prohibited** | — |
| Owner-level trade-offs flagged "REPORT BACK" below | needs owner | park the item (waypoint), continue with the rest |

## 📌 Context (labelled)

- *confirmed live 2026-11-15:* measured start chain ≈ 8–9.5 s before first byte (spec §1 table).
- *confirmed live:* Piped `/search` → 200, `/streams/9bZkp7q19f0` → 500 on both seeded instances.
  `dQw4w9WgXcQ` is a FALSE POSITIVE (served from an LBRY mirror, 200) — never use it as the
  stream-health probe id; use `jNQXAC9IVRw` (500 when blocked).
- *confirmed live:* googlevideo 403 → 206 transition occurs ~2.5–3.3 s after extraction ends,
  ~2 s before `available_at`.
- *confirmed live:* megaphone enclosure chain `podtrac → pdst.fm → pscrb.fm → mgln.ai →
  traffic.megaphone.fm → dcs-cached.megaphone.fm`; stripped: 1 redirect, ttfb 0.30–0.35 s.
- *confirmed in source (`691d926f`):* interface map below.
- *unknown to inspect (Task 8/9):* whether HLS URLs are `available_at`-gated; whether HLS
  variant/segment URLs need request headers; whether WebKit's HLS player already limits variants
  to the element's pixel size; which `player_client` set keeps audio-only + HLS formats.

### Interface map (from source at `691d926f`; revalidate)

- Command `stream_episode(db, pool, extractor, episode_id: String, format: Option<String>,
  quality: Option<String>) -> Result<StreamInfo, String>` — `src-tauri/src/commands/episodes.rs:230`.
  Order: `enclosure_stream_for` (:200, podcasts) → `video_id_for` (:174) →
  `order_for_search(&pool.get_all().await)` (:250) → `extractor.resolve_stream(..)` (:251) →
  pool feedback `mark_degraded` + `note_resolve_outcome` (:258-264) → `stream_info_from` (:184).
- `StreamInfo { url: String, headers: Option<HashMap<String,String>>, format: String }`
  (`episodes.rs:268`); TS twin `src/types/index.ts:423`.
- `Extractor::resolve_stream(&self, video_id, format, quality, candidates: &[Instance])
  -> Result<(StreamUrl, Vec<String>, Option<String>), String>` — `extractor/mod.rs:123`;
  `get_stream_with_yt_dlp` :323; `refresh_ytdlp_url` :277; `wait_until_available` :914;
  `rank_yt_dlp_formats` :946; `select_piped_stream` :624.
- `stream_proxy::register_with_refresh(url, headers, refresh: Option<RefreshFn>) -> String`
  (`stream_proxy.rs:99`); the proxy calls `refresh` on ANY upstream 403/410 (`:138`).
- `InstancePool::note_resolve_outcome(&self, id, failed)` `instance_pool/mod.rs:145`,
  `check_instance_health` :176, `health_probe` :260 (Piped → `/search?q=test`),
  `order_for_search(instances) -> Vec<Instance>` :299, `FAIL_STREAK_LIMIT = 3` :29.
- Commands registered in `src-tauri/src/lib.rs:155-257`; Extractor managed as `Arc<Extractor>`
  (lib.rs:105-111); `InstancePool` managed bare AND as `Arc`.
- Frontend: `episodeCommands.stream(episodeId, format?)` `src/hooks/useTauriCommands.ts:52`;
  resolve effect `src/components/PlayerProvider.tsx:287-355` (calls stream at :316, `setStreamUrl`
  :327); media `error` re-resolve path :505-539; `formatFor` :160; src assignment :441.
- Fullscreen: whole-document, `src/components/MiniPlayer.tsx:77-83`
  (`document.documentElement.requestFullscreen`). Track `document.fullscreenElement`.
- Cards: `EpisodeCard` `src/components/feed/EpisodeCard.tsx:20`, already wires
  `onPointerEnter/onPointerLeave` from `useHoverPreview` (`src/hooks/useHoverPreview.ts:80`).
- Queue: Zustand `useQueueStore` `src/store/slices/queueSlice.ts:80` (`items`, `currentIndex`,
  `repeatMode`, `shuffle`); `nextTrack` :174.
- Preferences: `UserPreferences` + `UserPreferencesPatch` in
  `src-tauri/echoprism-core/src/types.rs:107-150`; commands `get_settings` / `update_settings`
  (`src-tauri/src/commands/settings.rs:7-20`, one-field partial patches); TS
  `src/types/index.ts:9-25`; UI `src/components/screens/SettingsScreen.tsx` (toggle pattern :266).
- Tests: `cargo test --lib --manifest-path src-tauri/Cargo.toml` (workspace also has
  `echoprism-core`: run `cargo test --workspace --manifest-path src-tauri/Cargo.toml` for the
  full gate); `npm run test:run` (vitest); `npm run test:e2e` (Playwright, mocked backend via
  `src/mocks/router.ts`). Logging: tracing → stdout, `RUST_LOG`, default `info`.

## Global Constraints

- Owner targets (spec §2.1): pre-resolved YouTube ≤ 1.5 s click → first frame; cold YouTube
  ≤ 5 s (HARD); audio-only never slower than video; podcasts ≤ 1 s after stripping.
- Hover pre-resolve: dwell 400 ms; never for podcast episodes (no hover-triggered podcast request
  of any kind). Queue pre-resolve: next 2 items. Max 2 concurrent pre-resolves.
- Cache entry lifetime: googlevideo `expire` query param minus 10 min; commit only after the gate
  probe returned 200/206.
- Gate polling: 1-byte Range GET every 300 ms, ceiling 10 s (existing `MAX_AVAILABLE_AT_WAIT`).
- Quality defaults: windowed cap 720p, fullscreen cap 2160p (4K), start quality = lowest rung,
  data saver off (forces 480p), audio-only-on-metered off, restore mode "restore" (opt-in "ask").
  Choices for caps: 480 / 720 / 1080 / 1440 / 2160 / no cap.
- Podcast tracker stripping on by default; on failure retry the ORIGINAL URL once.
- Audio-only must never select a format that has a video codec.

## Review Focus

1. **A click during a pending pre-resolve** — must await the in-flight resolve, never start a
   second yt-dlp and never take longer than a cold resolve. (Task 4 test
   `click_during_prefetch_awaits_single_resolve`.)
2. **An expired or dead cache entry** — playback must fall back to a fresh resolve without a
   user-visible error. (Task 4 test `media_error_invalidates_and_reresolves` in vitest.)
3. **Rapid hover sweep across a results grid** — must not spawn more than 2 concurrent yt-dlp
   runs or queue unbounded work. (Task 4 test `prefetch_concurrency_is_capped_at_two`.)
4. **Toggling audio-only while a pre-resolve for the other mode is cached** — the play must use
   the entry for the CURRENT mode. (Task 5 test `prefetch_key_includes_mode`.)
5. **A podcast URL with an unknown or malformed tracker prefix** — must play the original URL
   untouched. (Task 7 table rows `unknown_prefix_untouched`, `truncated_prefix_untouched`.)

---

## 🛑 Phase 0 — forced preflight (read-only)

- [x] Write the three strategy sentences.
- [x] `cd ~/ClaudeWorkspace/echoprism && git status --porcelain && git log --oneline -3` —
      expect clean `master` at or after `691d926f`. Dirty paths are NOT yours: do not touch them.
- [x] `git fetch --tags origin && git tag --sort=-v:refname | head -3 && git ls-remote --tags
      origin | tail -3` — record the latest version (expected `v0.1.19`; another session may have
      shipped since — tags are a shared namespace).
- [x] `git worktree add -b feat/startup-speed ~/.wt/ep-startup master`; `cd ~/.wt/ep-startup`;
      `npm ci` (worktrees do not share `node_modules`).
- [x] Baseline: `cargo test --workspace --manifest-path src-tauri/Cargo.toml > /tmp/ep-base-rust.txt
      2>&1; echo EXIT:$?` and `npm run test:run > /tmp/ep-base-ts.txt 2>&1; echo EXIT:$?` — record
      pass/fail/ignored counts. A pre-existing red test is reported and fixed or the release is
      held (no release ships around a known error).
- [x] Tool check: `yt-dlp --version`, `command -v free-agent-tool.py remote-session.sh
      waypoints.py`, and find the ship script: `ls bin/rtc-ship.sh rtc-ship.json 2>&1` in the repo
      (memory `plain-repo-rtc-ship-wiring` / `rtc-ship-worktree-not-canonical-checkout` describe
      how echoprism shipped v0.1.19: `rtc-ship.sh` run against the WORKTREE).
- [x] Locate the DB migration mechanism for new preference columns (grep `migrations` /
      `CREATE TABLE user_preferences` under `src-tauri/`) and record it — Task 10 needs it.

**🧪 Receipt 0:** the outputs above, baseline counts, latest tag, migration mechanism path.

---

### Task 1: Start-up timer

**Files:**
- Create: `src-tauri/src/startup_timer.rs` (ring buffer + `info!` line)
- Modify: `src-tauri/src/commands/episodes.rs` (`StreamInfo` gains `timings`), `src-tauri/src/extractor/mod.rs` (stage stamps), `src-tauri/src/lib.rs` (register commands, manage state)
- Create: `src/lib/startupTimer.ts`; Modify: `src/components/PlayerProvider.tsx`, `src/types/index.ts`
- Test: `src-tauri/src/startup_timer.rs` (`mod tests`), `src/__tests__/startup-timer.test.ts`

**Interfaces:**
- Produces (Rust): `#[derive(Serialize, Deserialize, Clone, Default)] pub struct ResolveTimings
  { pub instances_ms: u64, pub ytdlp_ms: u64, pub gate_ms: u64, pub probe_ms: u64, pub
  cache_hit: bool }`; `StreamInfo.timings: Option<ResolveTimings>` (serde skip if None);
  `#[derive(Serialize, Deserialize, Clone)] pub struct StartupRecord { pub episode_id: String,
  pub source: String /* "youtube-video"|"youtube-audio"|"podcast" */, pub path: String /*
  "pre-resolved"|"cold" */, pub click_to_url_ms: u64, pub url_to_first_frame_ms: u64, pub
  total_ms: u64, pub timings: Option<ResolveTimings> }`; `pub struct StartupLog` (capacity 50)
  with `fn push(&self, r: StartupRecord)` and `fn recent(&self) -> Vec<StartupRecord>`;
  commands `report_startup(record: StartupRecord)` and `recent_startups() -> Vec<StartupRecord>`.
- Produces (TS): `startupTimer.click(episodeId: string, source: StartupSource)`,
  `startupTimer.urlReady(episodeId: string, timings?: ResolveTimings, cacheHit?: boolean)`,
  `startupTimer.firstFrame(episodeId: string): StartupRecord | null` (calls `report_startup`).

- [x] **Step 1: failing tests.** Rust `startup_log_keeps_last_50` (push 60 → `recent().len()==50`,
      first is #11) and `report_startup_logs_one_info_line` (capture via `tracing_test` or a
      custom layer; assert the line contains `startup total_ms=`). TS: `firstFrame` after
      `click` at t=0, `urlReady` at t=800, first frame at t=1200 (fake timers) → `{click_to_url_ms:
      800, url_to_first_frame_ms: 400, total_ms: 1200}`; `firstFrame` without `click` → `null`;
      a second `click` for another episode resets (only the latest play is measured).
- [x] **Step 2:** run both → FAIL (missing module).
- [x] **Step 3:** implement. Stamp stages inside `resolve_stream` / `get_stream_with_yt_dlp`
      with `std::time::Instant`. Frontend: `click` at the top of play/load, `urlReady` when
      `setStreamUrl(info.url)` runs (:327), `firstFrame` on the active element's first `playing`
      event for that src. `path = timings.cache_hit ? "pre-resolved" : "cold"`.
- [x] **Step 4:** tests GREEN; full suites still green.
- [x] **Discriminant:** temporarily make `push` not evict → `startup_log_keeps_last_50` RED; revert.
- [x] **Step 5:** commit `feat(timer): log click→URL→first-frame for every play`.

**🧪 Receipt 1** + offload cross-check (rule 8).

### Task 2: Per-capability instance health

**Files:** Modify `src-tauri/src/instance_pool/mod.rs`, `src-tauri/src/commands/episodes.rs:250`; Test in `instance_pool/mod.rs` tests.

**Interfaces:**
- Produces: `pub const STREAM_PROBE_VIDEO_ID: &str = "jNQXAC9IVRw";`
  `InstancePool.stream_health: Arc<RwLock<HashMap<String, InstanceHealth>>>`;
  `fn stream_health_probe(instance: &Instance) -> String` (Piped → `{url}/streams/{ID}`;
  Invidious → `{url}/api/v1/videos/{ID}`); `pub fn order_for_stream(instances: &[Instance],
  stream_health: &HashMap<String, InstanceHealth>) -> Vec<Instance>` (excludes instances whose
  stream health is `Failed`, same ordering as `order_for_search` otherwise).
- Resolve failures (`note_resolve_outcome`) update STREAM health/streaks, not search health.
  The background probe (existing 5-min loop) probes both capabilities independently.

- [x] **Step 1: failing tests.** `search_ok_streams_500_is_excluded_from_stream_candidates`
      (fake upstream: `/search` 200 with a valid body, `/streams/jNQXAC9IVRw` 500 → instance
      present in `order_for_search`, ABSENT from `order_for_stream` after one probe);
      `stream_probe_success_readmits` (500 then 200 → re-admitted);
      `resolve_streak_flips_stream_health_not_search_health`.
- [x] **Step 2:** FAIL. **Step 3:** implement; `stream_episode` calls `order_for_stream`.
- [x] **Step 4:** GREEN. **Discriminant:** point the stream probe at `/search` temporarily →
      the first test RED; revert.
- [x] **Step 5:** commit `fix(pool): judge stream eligibility by /streams, not /search`.

**🧪 Receipt 2** + offload cross-check.

### Task 3: Polled `available_at` gate (never through the proxy)

**Why the proxy is bypassed:** the proxy runs `refresh` (a full yt-dlp re-extraction) on ANY
upstream 403 (`stream_proxy.rs:138`). Polling a still-locked URL through it would trigger a
re-extraction per poll. The gate therefore polls googlevideo DIRECTLY with the candidate's
headers, and the proxy token is registered only after a 200/206.

**Files:** Modify `src-tauri/src/extractor/mod.rs` (`get_stream_with_yt_dlp` :323-392,
`refresh_ytdlp_url` :277-321, `wait_until_available` :914); Test in its tests module.

**Interfaces:** Produces `pub(crate) const GATE_POLL_INTERVAL: Duration = 300 ms;`
`async fn poll_until_playable(client: &reqwest::Client, url: &str, headers: &HashMap<String,
String>, ceiling: Duration, interval: Duration) -> Result<PollOutcome, String>` where
`PollOutcome { status: u16, content_type: Option<String>, waited: Duration }`; 403 → wait
`interval`, retry until `ceiling`; 200/206 → Ok; other status / error → Err immediately.
`wait_until_available` is removed (or reduced to a no-op shim with no callers — delete it).

- [x] **Step 1: failing tests.** `gate_poll_returns_soon_after_lock_opens` (fake upstream 403s
      for 1.0 s then 206; returns Ok within 1.0–1.5 s, NOT after a fake `available_at` of
      now+5 s); `gate_poll_gives_up_at_ceiling` (always 403, ceiling 1 s → Err after ~1 s);
      `gate_never_triggers_proxy_refresh` (refresh closure counter stays 0 while the upstream
      is locked; token is registered only after the 206).
- [x] **Step 2:** FAIL. **Step 3:** implement in both the resolve path and `refresh_ytdlp_url`.
      Keep the existing not-media content-type rejection on the final 200/206.
- [x] **Step 4:** GREEN; existing tests around `available_at` (:1355-1440) updated only where
      they asserted the old sleep — say which in the receipt.
- [x] **Live check:** `RUST_LOG=info cargo test --manifest-path src-tauri/Cargo.toml
      live_ytdlp_audio_resolves_to_loadable_proxy_url -- --ignored --nocapture` (or the existing
      live test's real name) — record gate time; expect ≈ 2.5–3.5 s after extraction.
- [x] **Discriminant:** set `interval` to 5 s → first test RED; revert.
- [x] **Step 5:** commit `perf(extractor): poll the available_at gate directly instead of sleeping`.

**🧪 Receipt 3** + offload cross-check.

### Task 4: Stream cache + `prefetch_stream`

**Files:** Create `src-tauri/src/stream_cache.rs`; Modify `commands/episodes.rs` (cache lookup in
`stream_episode`, new commands), `lib.rs` (manage `Arc<StreamCache>`, register commands).

**Interfaces:**
- `#[derive(Clone, Hash, Eq, PartialEq)] pub struct CacheKey { pub episode_id: String, pub mode:
  StreamMode }`, `pub enum StreamMode { Audio, Video }`.
- `pub struct CachedStream { pub primary: StreamInfo, pub fallback: Option<StreamInfo>, pub
  expires_at: std::time::Instant }`.
- `impl StreamCache { pub fn new(max_concurrent_prefetch: usize) -> Self; pub async fn
  get_or_resolve<F, Fut>(&self, key: CacheKey, resolve: F) -> Result<CachedStream, String> where
  F: FnOnce() -> Fut, Fut: Future<Output = Result<CachedStream, String>>; pub async fn
  prefetch<..same..>(&self, key, resolve) /* acquires the semaphore; never blocks the caller
  longer than enqueueing */; pub fn invalidate(&self, episode_id: &str); }`
- `pub fn expiry_from_url(url: &str, now: Instant) -> Instant` — googlevideo `expire=<unix>`
  minus 10 min; no param → now + 30 min.
- Commands: `prefetch_stream(episode_id: String, format: Option<String>, origin: String /*
  "hover"|"queue" */) -> Result<(), String>` — **backend choke point**: `origin=="hover"` for a
  podcast episode (enclosure path) returns Ok WITHOUT any network request;
  `invalidate_stream(episode_id: String)`.
- `StreamInfo` gains `fallback_url: Option<String>` (Task 7 and Task 9 fill it).
- In-flight dedupe: one shared future per key (e.g. `tokio::sync::OnceCell` in a `DashMap`, or
  `futures::future::Shared`); errors are NOT cached (entry removed on Err).

- [x] **Step 1: failing tests.** `click_during_prefetch_awaits_single_resolve` (resolver counter
      == 1 for a prefetch + concurrent get); `errors_are_not_cached`; `expired_entry_re_resolves`;
      `prefetch_concurrency_is_capped_at_two` (5 prefetches with a blocking resolver → max 2
      in flight); `expiry_from_url_parses_expire_param` (table incl. missing param);
      `hover_prefetch_of_podcast_makes_no_request` (fake upstream request counter stays 0).
- [x] **Step 2:** FAIL. **Step 3:** implement; `stream_episode` resolves through
      `get_or_resolve`, sets `timings.cache_hit`.
- [x] **Step 4:** GREEN. **Discriminant:** remove the dedupe map lookup → first test RED; revert.
- [x] **Step 5:** commit `feat(stream): gate-passed stream cache with in-flight dedupe and prefetch`.

**🧪 Receipt 4** + offload cross-check.

### Task 5: Frontend pre-resolve triggers

**Files:** Create `src/hooks/usePrefetchStream.ts`; Modify `EpisodeCard.tsx` (compose pointer
handlers with `useHoverPreview`), `PlayerProvider.tsx` (queue look-ahead; `invalidate_stream` on
media error before re-resolve at :505-539), `useTauriCommands.ts` (`prefetch`, `invalidate`
wrappers), `src/mocks/router.ts` (mock handlers). Test: `src/__tests__/prefetch-stream.test.tsx`.

**Interfaces:** `usePrefetchStream(episode: Episode): { onPointerEnter(): void; onPointerLeave():
void }` (400 ms dwell, no-op when `!episode.video_id`); `upcomingQueueEpisodes(state: QueueState,
n: number): Episode[]` (pure; next `n` after `currentIndex`, wraps when `repeatMode==='all'`,
returns `[]` when `shuffle` is on — the next item is unpredictable).

- [x] **Step 1: failing tests.** `hover_dwell_prefetches_after_400ms_not_before`;
      `pointer_leave_before_dwell_cancels`; `podcast_card_hover_never_prefetches`;
      `prefetch_key_includes_mode` (audio-only on → `format:'audio'`);
      `upcoming_queue_wraps_on_repeat_all_and_is_empty_on_shuffle`;
      `media_error_invalidates_and_reresolves`.
- [x] **Step 2:** FAIL. **Step 3:** implement; queue look-ahead fires on `currentIndex` /
      `items` change with `origin:'queue'`.
- [x] **Step 4:** GREEN (`npm run test:run`), e2e smoke `npm run test:e2e -- e2e/f03-video.spec.ts`.
- [x] **Discriminant:** set dwell to 0 → first test RED; revert.
- [x] **Step 5:** commit `feat(player): pre-resolve on hover dwell and for the next 2 queue items`.

**🧪 Receipt 5** + offload cross-check.

### Task 6: Audio-only never selects video

**Files:** Modify `extractor/mod.rs` `select_piped_stream` (:640-665) and `rank_yt_dlp_formats`
(:958-966). Tests in the extractor tests module.

- [x] **Step 1: failing tests.** `piped_audio_request_with_no_audio_streams_errs` (fixture with
      empty `audioStreams` + muxed video → `Err`, so resolution falls to yt-dlp);
      `ytdlp_audio_rank_contains_no_video_codec` (every candidate has `vcodec` none).
- [x] **Step 2:** FAIL. **Step 3:** drop the muxed-video and manifest fallbacks from the audio
      branches. **Step 4:** GREEN; update tests that pinned the old fallback and name them.
- [x] **Discriminant:** re-add the muxed fallback → second test RED; revert.
- [x] **Step 5:** commit `fix(extractor): audio-only never falls back to a video format`.

**🧪 Receipt 6** + offload cross-check.

### Task 7: Podcast tracker stripping, fallback, queue pre-follow

**Files:** Create `src-tauri/src/podcast/tracker_strip.rs` (+ `mod` line in `podcast/mod.rs`);
Modify `commands/episodes.rs` `enclosure_stream_for` (:200), `PlayerProvider.tsx` (fallback on
media error), preference field (Task 10 adds `skip_podcast_trackers`; until then default true).

**Interfaces:** `pub fn strip_trackers(url: &str) -> String` — repeatedly removes a known prefix
and re-adds `https://` to the embedded host; query string preserved; unknown → unchanged.
Prefixes (spec §2.6): `podtrac.com/pts/redirect.<ext>/`, `dts.podtrac.com/redirect.<ext>/`,
`pdst.fm/e/`, `pscrb.fm/rss/p/`, `mgln.ai/e/<digits>/`, `chtbl.com/track/<id>/`,
`chrt.fm/track/<id>/`, `op3.dev/e/`, `pfx.vpixl.com/<id>/`. `enclosure_stream_for` returns
`url = strip_trackers(original)`, `fallback_url = Some(original)` when they differ.
`async fn follow_redirects(url: &str) -> Result<String, String>` (1-byte Range GET, returns the
final URL) used ONLY by `prefetch_stream` with `origin=="queue"`.

- [x] **Step 1: failing tests** (table): measured megaphone chain →
      `https://traffic.megaphone.fm/VMP1004386376.mp3`; podtrac-only; chartable+podtrac nested;
      query preserved; `unknown_prefix_untouched`; `truncated_prefix_untouched`
      (`https://pdst.fm/e/` with nothing after). Frontend:
      `stripped_url_error_retries_original_once` (second error → normal error path, no loop).
- [x] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** GREEN.
- [x] **Live check:** `curl -4 -s -L -o /dev/null -r 0-65535 -w '%{num_redirects} %{time_starttransfer}\n'`
      on one stripped enclosure from the dev DB, read via `sqlite3 -readonly` (never write it).
- [x] **Discriminant:** remove `mgln.ai` from the list → megaphone row RED; revert.
- [x] **Step 5:** commit `feat(podcast): skip tracker redirects with original-URL fallback`.

**🧪 Receipt 7** + offload cross-check.

### Task 8: Cold-path — fewer yt-dlp clients, HLS-lock test (measure first)

**Files:** Modify `extractor/mod.rs` (one `YT_DLP_EXTRACTOR_ARGS` constant applied to every
`-J` invocation: resolve, refresh, storyboard); write findings to
`docs/plans/2026-11-15-cold-path-findings.md`.

- [x] **Step 1 (measure, scratch script outside the repo, `--help` supported):** for 3 videos
      (`9bZkp7q19f0`, `jNQXAC9IVRw`, `kJQP7kiw5Fk`) time `yt-dlp --force-ipv4 -J` with the default
      client set and with candidates such as `--extractor-args "youtube:player_client=tv"`,
      `…=web_safari`, `…=ios`, `…player_skip=webpage,configs`. For each: extraction time,
      presence of an audio-only `m4a`/`opus` format, presence of an `m3u8_native` format,
      `available_at` presence. ≤ 30 runs total.
- [x] **Step 2 (HLS lock):** for the HLS `manifest_url`, `curl -4` the master, one variant
      playlist and one segment immediately after extraction and every 300 ms — record 403/200
      timeline and whether any request needs headers.
- [x] **Step 3:** pick the fastest client set that keeps BOTH audio-only and HLS formats;
      failing test `extractor_args_applied_to_every_invocation` (fake yt-dlp script records argv,
      as the existing tests at :1105-1165 do); implement; GREEN.
- [x] **Step 4:** live cold measurement through the real resolve path (ignored live test) for
      video and audio — record totals against the ≤ 5 s target.
- [x] **Gate:** if cold ≤ 5 s is still missed, write the numbers + remaining options (e.g. a
      persistent extractor process) into the findings doc, add a waypoint
      `echoprism: cold start still > 5 s — options in cold-path-findings.md` marked as needing the
      owner, and CONTINUE with the remaining tasks. Do not build a persistent extractor unasked.
- [x] **Step 5:** commit `perf(extractor): restrict yt-dlp player clients for faster cold resolves`.

**🧪 Receipt 8** + offload cross-check (dispatch the findings doc + raw numbers for an
independent arithmetic check).

### Task 9: HLS video with caps

**Files:** Create `src-tauri/src/hls_master.rs`; Modify `stream_proxy.rs` (new route
`/hls/<token>/master.m3u8?cap=<h>&start=<lowest|cap>`; segment/variant rewrite only if Task 8
found headers are required), `extractor/mod.rs` (video resolves to the HLS master with the
progressive format-18 entry as `fallback_url`), `PlayerProvider.tsx` (cap from settings +
`document.fullscreenElement`; HLS error → `fallback_url`).

**Interfaces:** `pub fn filter_master_playlist(master: &str, cap_height: Option<u32>, start:
StartQuality) -> String` — keeps `#EXT-X-STREAM-INF` variants with `RESOLUTION` height ≤ cap
(variants without RESOLUTION kept), preserves all non-variant tags, and lists the lowest kept
variant FIRST when `start == StartQuality::Lowest` (Apple's player starts on the first listed
variant); never returns a playlist with zero variants (if the cap removes all, keep the lowest).
`pub enum StartQuality { Lowest, Cap }`.

- [x] **Step 0 (prototype, REPORT BACK rule from spec §2.5):** in a dev run, play one HLS master
      that lists variants up to 2160p in the normal window and in fullscreen; record which
      variant WebKit picks (proxy request log shows variant fetches). Hypothesis: WebKit already
      limits to the element's pixel size. Record the result in the findings doc.
      - If it holds: serve ONE master with cap = fullscreen cap; windowed limiting is natural and
        leaving fullscreen steps down gradually. Proceed.
      - If not: implement the windowed cap via the filtered master (720p) and a fullscreen swap
        ONLY if it does not reload/stutter; otherwise ship the windowed cap, leave fullscreen at
        the windowed cap, and add an owner waypoint ("fullscreen UHD needs hls.js/MSE or a
        reload — owner trade-off"). Do not adopt hls.js unasked.
- [x] **Step 1: failing tests** for `filter_master_playlist`: cap 720 drops 1080/2160; no cap
      keeps all; `Lowest` puts the 144p/240p variant first; cap below every variant keeps the
      lowest one; audio-only `#EXT-X-MEDIA` groups preserved. Frontend: `hls_error_uses_fallback_url`.
- [x] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** GREEN + e2e smoke.
- [x] **Discriminant:** off-by-one (`<` instead of `≤`) → a 720p-cap row RED; revert.
- [x] **Step 5:** commit `feat(video): capped adaptive HLS with progressive fallback`.

**🧪 Receipt 9** + offload cross-check.

### Task 10: Quality and podcast settings

**Files:** core `types.rs` (`UserPreferences` + `UserPreferencesPatch` + `apply`), the migration
mechanism found in Phase 0, `src/types/index.ts`, `SettingsScreen.tsx` (new "Playback quality"
section, existing toggle/select patterns), `src/mocks/data.ts`.

**Interfaces (new preference fields, serde defaults so old rows parse):**
`windowed_quality_cap: Option<u32>` (default `Some(720)`; `None` = no cap),
`fullscreen_quality_cap: Option<u32>` (default `Some(2160)`), `start_quality: StartQuality`
(default `Lowest`), `data_saver: bool` (false; when true both caps are 480),
`audio_only_on_metered: bool` (false), `metered_restore: MeteredRestore` (`Restore` | `Ask`,
default `Restore`), `skip_podcast_trackers: bool` (true).

- [ ] **Step 1: failing tests.** `old_preferences_row_parses_with_new_defaults`;
      `one_field_patch_updates_only_that_field` (pattern of `settings.rs:51-75`);
      `data_saver_forces_480_caps` (pure `fn effective_caps(&UserPreferences) -> (Option<u32>,
      Option<u32>)`); vitest: each new control sends a one-field patch.
- [ ] **Steps 2–4:** FAIL → implement → GREEN; wire Tasks 7 and 9 to read these fields.
- [ ] **Discriminant:** drop `#[serde(default)]` on one new field → first test RED; revert.
- [ ] **Step 5:** commit `feat(settings): playback quality caps, data saver, tracker toggle`.

**🧪 Receipt 10** + offload cross-check.

### Task 11: Audio only on metered networks (Mac)

**Files:** Create `src-tauri/src/network_cost.rs` (macOS Network.framework `NWPathMonitor`
`isExpensive` / `isConstrained`, emitted to the frontend as event `network-cost-changed {
expensive: bool, constrained: bool }`); Create `src/lib/audioOnlyAuto.ts`; Modify
`PlayerProvider.tsx` (audio-only origin tracking), MiniPlayer/AudioOnlyToggle (small "auto" badge).

**Interfaces:** `type AudioOnlyOrigin = 'user' | 'auto'`; pure reducer
`nextAudioOnly(state: { on: boolean; origin: AudioOnlyOrigin; userChoiceBeforeAuto: boolean |
null }, event: { kind: 'metered' | 'unmetered' | 'user-toggle'; on?: boolean }, prefs: {
audio_only_on_metered: boolean; metered_restore: 'restore' | 'ask' }): { state; prompt: boolean }`.

- [ ] **Step 0:** choose the binding (crate such as `objc2-network`, or a tiny Swift helper via
      the build script) — record the choice and pinned version; if neither builds within ~1 h,
      add an owner waypoint and skip Task 11 (keep the setting hidden). The iOS half is deferred
      to the iOS port plan (`docs/plans/2026-11-14-ios-personal-port.md`) — add one line there.
- [ ] **Step 1: failing tests** for the reducer: metered → on, origin auto, remembers prior;
      unmetered + restore → back to prior; user toggles while auto → origin user, unmetered
      leaves it; `ask` → `prompt: true`, no change; setting off → metered ignored.
- [ ] **Steps 2–4:** FAIL → implement → GREEN.
- [ ] **Discriminant:** make `unmetered` always turn audio-only off → "user had it on" row RED; revert.
- [ ] **Step 5:** commit `feat(player): opt-in audio only on metered networks with restore`.

**🧪 Receipt 11** + offload cross-check.

### Task 12: Acceptance measurement, final review, ship through release

- [ ] Full gates: `cargo test --workspace --manifest-path src-tauri/Cargo.toml`, `npm run
      test:run`, `npm run test:e2e`, `npm run build` (tsc) — all green, counts vs Receipt 0.
- [ ] Live acceptance (resolve path, ignored live tests, IPv4 as the app does): cold video, cold
      audio, warm (prefetched) video, warm audio, one podcast — record ms per stage. Click →
      first-frame in the GUI cannot be measured unattended: state "not tested — owner dogfood
      reads `recent_startups`" in the delivery.
- [ ] Final whole-branch review (superpowers:requesting-code-review), plus an offloaded
      independent review of `git diff master...feat/startup-speed` (stateless dispatch, role
      validator, cross-family vs the model you run as). Fix confirmed findings.
- [ ] Version: next free patch after the latest tag from Phase 0 (expected `0.1.20`), bumped in
      EVERY surface `tests/test_version_consistency.sh` checks (package.json, tauri.conf.json,
      Cargo.toml, Cargo.lock, CHANGELOG.md). Re-fetch tags right before choosing.
- [ ] Ship: run `rtc-ship.sh` against the WORKTREE (never the canonical checkout) — merge to
      `master`, tag, GitHub release, refresh, then verify with `git ls-remote --tags origin` and
      `gh release view v<ver>`. Fast-forward the canonical checkout only if it is clean and on
      `master` (`git -C ~/ClaudeWorkspace/echoprism pull --ff-only`); never switch its branch.
- [ ] Dogfood: launch the released build or the dev launcher, play one YouTube video, one
      audio-only video, one podcast; read `recent_startups` (or the stdout `startup` lines) and
      record them. If a GUI run is impossible, say so.

**🧪 Receipt 12:** gate counts, live timings table vs targets, review findings + fixes, tag and
release URLs from `ls-remote` / `gh`, dogfood numbers or "not tested".

---

## 🧨 Adversarial review

- Edit the canonical checkout to save a worktree → dev launcher runs half-built code → owner's
  app breaks → rule 3 → Receipt 0 shows the worktree path; `git -C ~/ClaudeWorkspace/echoprism
  status` clean at the end.
- Poll the gate through the proxy → a test passes on a fake upstream without refresh → every
  real play re-runs yt-dlp 5–10× → Task 3 rationale → `gate_never_triggers_proxy_refresh`.
- Use `dQw4w9WgXcQ` as the stream-probe id → probe reports healthy → blocked instances stay in
  the path → Context note → `STREAM_PROBE_VIDEO_ID` test fixture.
- Measure without `--force-ipv4` → 183 s numbers → wrong conclusions → rule 7 → receipts show
  `real` vs `user`.
- Cache a URL before the gate opens → "pre-resolved" plays still wait 3–5 s → targets met only on
  paper → Global Constraints → `click_during_prefetch_awaits_single_resolve` + live warm timing.
- Hover prefetch for podcasts slips in through a new caller → inflated listening stats →
  backend choke point in `prefetch_stream` → `hover_prefetch_of_podcast_makes_no_request`.
- `cargo test | tail` hides a non-zero exit → red suite reads green → redirect to a file and echo
  `EXIT:$?` → every receipt shows `EXIT:`.
- Ship from the canonical checkout → `rtc-ship.sh` exits 0 having shipped nothing → run against
  the worktree → `ls-remote` + `gh release view` in Receipt 12.
- Pick a version another session already used → tag collision → re-fetch tags before choosing →
  Receipt 12 shows the fetch.
- Free-model cross-check says "looks fine" → confirmation bias → treat as advisory, confirm
  findings in source → receipts quote file:line for each acted-on finding.
- Untestable safely: real GUI click → first frame (owner dogfood); bot-block thresholds of
  YouTube (keep live runs ≤ 30/h).

## 🏁 Final review and delivery

Report: implemented vs only planned (e.g. a parked Task 9 fullscreen half or Task 11); every
receipt that ran and every test that did not; live timings vs each target with "met / not met";
waypoints added (owner-gated items); confirmation that the canonical checkout is clean on
`master`, the live app data was untouched, no secrets appear in receipts; the released version,
tag and release URL as verified by `ls-remote` / `gh`; and that the run stopped at the granted
boundary (release + refresh + dogfood — nothing beyond). Reread this plan file before reporting.
