# Task 5 — optional "YouTube player" embed mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (NATIVE: implement
> every task yourself in this session, then one final whole-branch review). Steps use
> checkbox (`- [ ]`) syntax.

**Goal:** add an opt-in Settings toggle "Use YouTube's player for video (faster start, may
show ads it fails to block)" that plays YouTube VIDEO-mode episodes through the official
IFrame Player API served by the app's own local proxy, falling back to the extractor
pipeline on any embed error. Ships as its own patch release (v0.1.24) via rtc-ship.

**Architecture:** the local stream proxy gains a route `/embed/player.html` that serves a
tiny HTML page loading `https://www.youtube-nocookie.com/iframe_api` with the page origin
being the proxy origin (so YouTube sees a valid `http://127.0.0.1:<port>` referrer — the
§11 spike proved `error 153` without it). The app renders ONE persistent
`<iframe src="http://127.0.0.1:<port>/embed/player.html">` in the player stage when the
toggle is on, the episode has a `video_id`, and the playback format is video; control and
state flow over `postMessage` (`loadVideoById`/`playVideo`/`pauseVideo`/`seekTo` +
`onStateChange`/time events). `onError` 150/101/153/5/100 falls back to the extractor
pipeline with one log line. Audio-only NEVER uses the embed. Ad blocking = a WKWebView
content rule list + an all-frames WKUserScript that prunes ad keys, attached via the Tauri
platform hook (`with_webview` → `WKUserContentController`), both in versioned resource
files.

**Tech Stack:** Rust (axum proxy in `src-tauri/src/stream_proxy.rs`), Tauri 2 webview
(`src-tauri/src/lib.rs`), React/TS player (`src/components/PlayerProvider.tsx`,
`src/components/screens/PlayerScreen.tsx`), SQLite prefs (`src-tauri/src/db/`),
Playwright webkit e2e, vitest jsdom.

**Spec:** `docs/plans/2026-11-16-followups-plan.md` Task 5 + §11 spike (measured: warm
`loadVideoById` → PLAYING in 0.46 s; cached cold 1.3–1.9 s; truly cold 5.4 s; no-referrer
→ error 153; embed-disabled → error 150). Milestone-QC rules of §6b + the playbook
`~/.claude/plans/_PLAYBOOKS/Playbook-milestone-qc-offload-test-proof.md` apply to every
milestone (delivery-shaped assertions, known-bad discriminants RED first, cross-family
validator dispatch).

## Global Constraints

- Work ONLY in worktree `~/.wt/ep-task5` (branch `feat/youtube-embed` from master).
  NEVER edit/switch/reset the canonical checkout `~/ClaudeWorkspace/echoprism` (except a
  final `pull --ff-only` when clean on master).
- Ship through RELEASE as v0.1.24: fresh `git fetch --tags` + `ls-remote` before bumping;
  bump all FIVE version surfaces (package.json, src-tauri/tauri.conf.json,
  src-tauri/Cargo.toml, src-tauri/Cargo.lock, CHANGELOG.md — `rtc-ship.sh --bump-versions`
  writes only package.json + CHANGELOG, the 3 src-tauri surfaces are edited by hand and
  `tests/test_version_consistency.sh` gates the split); rtc-ship from the WORKTREE;
  never force-push, never move a published tag.
- Commits staged BY PATH with both attribution trailers (harness Opus line + the running
  free-lane model's trailer from memory `commit-attribution-by-model`).
- Network probes force IPv4 (`curl -4`, `yt-dlp --force-ipv4`); ≤ 30 yt-dlp runs/hour.
- Every behaviour gets a discriminant (known-bad mutation RED before GREEN); never weaken
  a test. Full gates parallel-first: vitest, e2e BOTH projects, cargo test --lib,
  tsc/eslint, build.
- No secrets/argv/tokens in logs or receipts. Live-app data read-only.

## Review Focus

1. Embed-disabled videos (error 150) must fall back silently to the extractor — a user
   must never be stranded on an error. → Task 4 e2e + unit.
2. Referrer/origin: the embed page MUST be served from the proxy origin or YouTube answers
   153 — pin the route's origin/CSP in a Rust route test. → Task 2.
3. Audio-only must NEVER load the embed (assert zero `/embed/` requests in audio mode). →
   Task 4 e2e.
4. Position sync across embed↔extractor switches (the v0.1.22 playhead fix must hold
   when the embed player is the source). → Task 4 e2e.
5. The ad-prune user script must not corrupt non-ad JSON (prune only the named keys;
   fixture test with/without ad keys). → Task 5 unit.
6. Toggle OFF must produce zero embed traffic (default off). → Task 4 e2e assertion.

---

### Task 1: preference plumbing for `use_youtube_player` (default OFF)

**Files:**
- Modify: `src-tauri/src/db/migrations.rs` (append `ALTER TABLE user_preferences ADD
  COLUMN use_youtube_player INTEGER NOT NULL DEFAULT 0` following the existing pattern)
- Modify: the Rust `UserPreferences` struct + `get_preferences`/`update_preferences` in
  `src-tauri/src/db/queries.rs` (find the struct import first)
- Modify: `src/types/index.ts` (`use_youtube_player?: boolean;` with a doc comment)
- Modify: `src/components/screens/SettingsScreen.tsx` (new checkbox next to the
  audio-only ones: `checked={preferences?.use_youtube_player ?? false}` +
  `updateMutation.mutate({ use_youtube_player: e.target.checked })`, label exactly "Use
  YouTube's player for video (faster start, may show ads it fails to block)")
- Test: `src-tauri` db test (prefs roundtrip: default false persists, update to true
  reads back); vitest for the Settings screen row rendering default-off.

**Interfaces:** produces `UserPreferences.use_youtube_player: bool` (Rust) and
`preferences.use_youtube_player?: boolean` (TS) consumed by Task 4.

- [ ] Step 1: write the failing Rust roundtrip test + vitest render test (RED)
- [ ] Step 2: implement migration + struct + queries + TS type + Settings checkbox
- [ ] Step 3: run tests GREEN (`cargo test --lib db::`, `npx vitest run
  src/__tests__/settings*`)
- [ ] Step 4: commit by path

### Task 2: proxy route `/embed/player.html`

**Files:**
- Modify: `src-tauri/src/stream_proxy.rs` (new route next to `/stream/` and `/hls/`)
- Create: `src-tauri/resources/embed_player.html` (IFrame API loader page; host
  `https://www.youtube-nocookie.com`; NO referrer policy that strips the proxy origin)
- Test: route test in `stream_proxy.rs` tests (serves 200, `text/html`, body contains
  `youtube-nocookie.com/iframe_api`, and the response carries a CSP that allows the
  nocookie script and `frame-ancestors 'self'`)

**Interfaces:** produces `GET http://127.0.0.1:<port>/embed/player.html` consumed by
Task 4's iframe `src`.

- [ ] Step 1: failing route test (RED: 404 today)
- [ ] Step 2: implement route + resource page (bundled via the existing resources path in
  tauri.conf.json — verify `ytdlp_helper.py`'s bundling pattern covers it)
- [ ] Step 3: GREEN route test + `cargo test --lib`
- [ ] Step 4: commit by path

### Task 3: `YoutubeEmbedPlayer` component (one warm iframe, postMessage protocol)

**Files:**
- Create: `src/components/player/YoutubeEmbedPlayer.tsx`
- Create: `src/lib/embedPlayerProtocol.ts` (typed postMessage wrappers: `loadVideoById`,
  `playVideo`, `pauseVideo`, `seekTo`, `getCurrentTime`; events `onStateChange`,
  `onError`, time ticks)
- Test: `src/__tests__/youtube-embed-player.test.tsx` (jsdom, fake iframe +
  `window.addEventListener('message')` stub: command messages have the right shape;
  incoming state/time events update a callback)

**Interfaces:** props `{ videoId, port, autoplay, onStateChange, onError, onTime,
  onReady, registerApi }`; exposes the same control surface PlayerProvider already uses
  for media elements (play/pause/seek/currentTime) so Task 4 is a swap.

- [ ] Step 1: failing unit tests (RED)
- [ ] Step 2: implement protocol module + component (ONE iframe kept mounted for the
  session — the 0.46 s warm-load number depends on it)
- [ ] Step 3: GREEN + `npx vitest run src/__tests__/youtube-embed-player.test.tsx`
- [ ] Step 4: commit by path

### Task 4: PlayerProvider/PlayerScreen integration + onError fallback

**Files:**
- Modify: `src/components/PlayerProvider.tsx` (when `use_youtube_player` && episode has
  `video_id` && playbackFormat==='video' → render the embed player instead of `<video>`;
  wire play/pause/seek/position/queue-advance/SponsorBlock seekTo/startupTimer through the
  embed API; on onError 150/101/153/5/100 → log one line + clear the embed flag for the
  episode and run the normal extractor resolve)
- Modify: `src/components/screens/PlayerScreen.tsx` (render the embed in the video stage)
- Modify: `src/mocks/router.ts` (expose the proxy port + a way for e2e to force an embed
  error, e.g. episode id `ep-embed-blocked` whose player answers error 150)
- Test: jsdom integration tests in `src/__tests__/` (embed chosen only when pref on +
  video_id + video format; audio mode never embeds; error 150 → extractor path taken);
  e2e `e2e/embed-player.spec.ts` (webkit): proxy-served embed page with the IFrame API
  stubbed via `page.route` on youtube-nocookie — play/pause/seek/state flow, error-150
  fallback, position preserved across an embed→extractor switch, and zero `/embed/`
  requests when the toggle is off. Discriminants: remove the onError fallback → e2e RED;
  allow embed in audio mode → RED.

- [ ] Step 1: failing unit + e2e tests (RED)
- [ ] Step 2: implement integration
- [ ] Step 3: GREEN unit + `CI=true npx playwright test --project=webkit
  e2e/embed-player.spec.ts`, then full gates
- [ ] Step 4: commit by path

### Task 5: Brave-level ad blocking (content rule list + all-frames user script)

**Files:**
- Create: `src-tauri/resources/adblock/content-rules.json` (Safari content-blocker JSON:
  ad/tracking hosts + YouTube ad endpoints `/pagead/`, `/api/stats/ads`, doubleclick.net,
  googlesyndication.com, `/ptracking`) with a README + date
- Create: `src-tauri/resources/adblock/prune-ads.js` (WKUserScript, `forMainFrameOnly:
  false`: wraps fetch/XHR to prune `adPlacements`, `playerAds`, `adSlots` from
  `ytInitialPlayerResponse` and `/youtubei/v1/player` JSON responses)
- Modify: `src-tauri/src/lib.rs` (attach both via the `with_webview` platform hook on the
  main window builder → `WKUserContentController addContentRuleList` + `addUserScript`;
  bundle the resources like `ytdlp_helper.py`)
- Test: unit test of the prune function extracted to a testable module
  (`src/lib/adPrune.ts` shared by the WKUserScript body) on fixture player responses with
  and without ad keys (non-ad data untouched); discriminant: remove the prune keys → RED.

- [ ] Step 1: failing prune unit tests (RED)
- [ ] Step 2: implement resources + webview hook + shared prune module
- [ ] Step 3: GREEN + full gates
- [ ] Step 4: commit by path

### Task 6: milestone QC + ship v0.1.24

- [ ] Cross-family validator dispatch (free-agent-tool.py, role=validator,
  avoid_family=mistral) on the diff + test files; run every proposed mutation RED then
  restore (playbook §Executor duties)
- [ ] Full gates: `cargo test --lib`, `npm run test:run`, `npm run test:e2e` (both
  projects), `npx tsc --noEmit`, eslint, `npm run build`, version-consistency gate
- [ ] Bump all 5 surfaces to 0.1.24 + CHANGELOG entry; commit; `rtc-ship.sh
  ~/.wt/ep-task5 0.1.24 "<title>"`; verify `ls-remote` tag VISIBLE + `gh release view`
- [ ] Release-artifact launch gate on the CI dmg (download, `otool -L` no runner/netmon,
  launch ≥ 10 s from the mount); Homebrew cask bump (version + dmg sha256, rebase over
  origin/main, push); canonical `pull --ff-only`
- [ ] Dogfood with the toggle ON: 3 videos (record `startup total_ms=` warm starts), one
  embed-disabled video falls back and plays, one ad-carrying video plays with no ad
  segment (record its id) or honestly note the slip; receipt lines appended to this file
- [ ] Close the Task 5 section in `docs/plans/2026-11-16-followups-plan.md` (Status line)
