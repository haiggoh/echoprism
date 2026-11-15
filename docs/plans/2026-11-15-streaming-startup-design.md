# Browser-fast playback start — design

- **Date:** 2026-11-15
- **Status:** APPROVED design (owner, 2026-11-15) — next step is the implementation plan.
- **Supersedes:** `2026-11-13-stream-ahead.md` options 1–2 (hover prefetch, queue pre-roll),
  which this design adopts and extends. That plan's measured chain still stands; its
  Option 0 shipped (round 13 fail streaks) but is undone by a probe gap (§2.4).

## 1. Intent

**Owner goal:** a YouTube video starts about as fast as in Brave / Safari with an ad
blocker. Audio-only must be at least as responsive as video and must never fetch video
bytes. Podcasts start immediately. Video quality adapts to bandwidth (HLS).

**Why it is slow today (measured 2026-11-15, outside the app, `curl -4` / `yt-dlp --force-ipv4`):**

| Stage, per click | Cost | Code |
|---|---|---|
| Both Piped instances tried; both 500 on `/streams` (YouTube "confirm you're not a bot") | ~0.8 s | `extractor/mod.rs:135` |
| Fresh `yt-dlp -J` process | 2.7–3.7 s | `extractor/mod.rs:335` |
| Sleep until `available_at` + 0.3 s | 4.3–4.8 s | `extractor/mod.rs:363` |
| 1-byte probe, then the media element opens its own connection | ~0.1–0.5 s | `extractor/mod.rs:375` |
| **Before first byte** | **≈ 8–9.5 s** | |

Facts the design rests on (all measured 2026-11-15):
- It **is** streaming: `stream_proxy.rs` forwards chunks and Range; seeking is fast because
  the URL is already resolved. The cost is resolution, not transfer.
- The `available_at` gate is real (403 then 206) but opens **~2 s before** the time the
  code waits for: 206 arrived 2.5–3.3 s after extraction while `available_at` said 4.3–4.8 s.
- yt-dlp offers `m3u8_native` (HLS) formats; WKWebView plays HLS natively.
- Video mode today plays format 18 (360p muxed) — the only progressive muxed format.
- Piped health probe hits `/search` (200) while playback needs `/streams` (500), so failed
  instances are re-admitted every 5 min.
- Podcast enclosures play directly (`commands/episodes.rs:200`); network first byte is
  0.4–3.8 s. A megaphone feed goes through 5 hops
  (`podtrac → pdst.fm → pscrb.fm → mgln.ai → traffic.megaphone.fm → dcs-cached`);
  stripping the four tracker prefixes measured **1.3–1.5 s → 0.30–0.35 s**, 206 OK.
- IPv6 to YouTube is blackholed on the owner's home network; the app already persists
  `ipv6_youtube: broken` and runs yt-dlp on IPv4. Any measurement must force IPv4.

## 2. What gets built

### 2.1 Start-up timer (first, so every later step is measured)
Per play, record: click → resolve start → URL ready → media `canplay`/first frame, tagged
with source (`youtube-video`, `youtube-audio`, `podcast`), path (`pre-resolved` / `cold`)
and stage timings from the backend (instances, yt-dlp, gate wait, probe). Written to the
app log at `info`; *(builder's call: also a dev-only overlay or a debug command that prints
the last N plays)*.

**Acceptance targets (owner):**
- pre-resolved YouTube (hovered or queued): **≤ 1.5 s** click → first frame
- cold YouTube click: **≤ 5 s** — a HARD target (owner, after the builder check showed
  §2.3 + §2.4 alone reach only ~5–7 s); §2.8 is the workstream that closes the gap
- audio-only never slower than video for the same item
- podcasts *(my call, derived from the measurements)*: ≤ 1 s after tracker stripping, on a
  normal connection

### 2.2 YouTube pre-resolve + cache
- **Triggers (owner):** hover/focus on a card, and the upcoming queue items while one
  plays. NOT every visible card (bot-block risk). *(My calls: hover needs a dwell of
  ~400 ms, as in the 11-13 plan; queue depth = next 2 items.)*
- Resolve in the **mode that will play**: audio-only resolves an audio format, video
  resolves the HLS manifest (§2.5). A toggle change invalidates nothing; it just resolves
  the other mode on demand.
- **Cache** keyed by `(video_id, mode)` → resolved stream (proxy token + upstream URL +
  headers + format id). Lifetime: until shortly before the googlevideo URL's `expire`
  parameter *(my call: 10 min margin)*. In-flight dedupe: a click during a pending
  pre-resolve awaits it instead of starting a second yt-dlp (it is always further along
  than a fresh resolve would be).
- *(My call)* An entry is committed to the cache only **after the gate probe answered
  206** (§2.3), so a cache hit is always immediately playable. A pre-resolve whose gate
  never opens within the 10 s ceiling caches nothing; the click then resolves cold.
- *(My call)* One entry carries everything the play needs from the same `yt-dlp -J`
  dump: for video, the HLS master (URL + headers) **and** the progressive format-18
  fallback; for audio, the ranked audio-only candidates. No second extraction on fallback.
- A cached entry that fails at play time falls back to a fresh resolve (the existing
  proxy refresh-on-403 path already does this for the proxy).
- *(My call)* Global cap on concurrent pre-resolves (2) so a fast mouse sweep cannot
  spawn a yt-dlp storm.

### 2.3 Shorter `available_at` gate
Replace "sleep until `available_at` + 0.3 s" with **polling the candidate** (1-byte Range
GET) every ~300 ms starting immediately after extraction, capped at the existing 10 s
ceiling. Measured saving ≈ 2 s on every cold resolve. A pre-resolve absorbs the gate
entirely in the background.

### 2.4 Instance health per capability
The Piped probe must test what playback uses: a `/streams/<known id>` check decides
stream eligibility; `/search` keeps deciding search eligibility. An instance can be
healthy for search and failed for streams. Removes the ~0.8 s per click and the
5-minute re-admission loop.

### 2.5 Video quality via HLS
- Video mode prefers yt-dlp's HLS manifest (`manifest_url`, protocol `m3u8_native`);
  played natively by the `<video>` element. If HLS fails to load or play, fall back to
  the progressive 360p format already held in the cache entry (§2.2) — no new resolve.
- *(My call)* **Routing:** the local proxy serves the master playlist, filtered to the
  current cap. Variant playlists and segments go DIRECT to googlevideo when they need no
  request headers; when they do, the proxy rewrites their URLs to proxy tokens and
  forwards with headers (keeping refresh-on-403 per token). The builder verifies which
  case holds before building the rewrite.
- *(My call)* **Start quality** is enforced by ORDER: Apple's HLS player starts on the
  first variant listed in the master playlist, so the filtered master lists the
  start-quality rung first. No hls.js needed for this.
- **Caps (owner):** windowed **720p**; fullscreen lifts the cap up to **4K/UHD**; leaving
  fullscreen drops the cap back **gradually** (buffered high-res plays out, then steps
  down — no flush, no stutter).
- *(Builder must establish)* how the cap is enforced: native WebKit HLS exposes no
  rung-selection API, so the likely mechanism is a **filtered master playlist** served by
  the local proxy (only variants ≤ cap). A cap change on fullscreen enter/exit then swaps
  to a differently filtered playlist; whether that can be done without a reload (and so
  meets "gradually") must be prototyped first. If it cannot, report back before choosing
  an alternative (e.g. hls.js with MSE) — that is an owner-level trade-off.
- Audio-only never uses HLS video; it stays on the audio-only format (m4a 140 /
  opus 251). It must never fall back to a muxed video format *(my call; today the Piped
  path does exactly that, `select_piped_stream`)*.

### 2.6 Podcasts: tracker stripping (owner: strip + fall back)
- Strip known third-party measurement prefixes from enclosure URLs so the request goes
  straight to the hosting platform (which still counts the download). Initial list from
  the measured chain plus common ones *(builder's call to extend)*: podtrac
  (`podtrac.com/pts/redirect.*`, `dts.podtrac.com/redirect.*`), `pdst.fm/e/`,
  `pscrb.fm/rss/p/`, `mgln.ai/e/<n>/`, `chtbl.com/track/<id>/`,
  `chrt.fm/track/<id>/`, `op3.dev/e/`, `pfx.vpixl.com/<id>/`.
  Strip repeatedly until no known prefix remains; unknown URLs are untouched.
- If the stripped URL fails to load (error or non-media response), **retry once with the
  original URL** silently.
- Settings toggle "Skip podcast tracking redirects", on by default.
- **Pre-follow** (resolve the remaining redirect to its final URL ahead of time) **only for
  upcoming queue items, never on hover** (owner: hover must not inflate listening stats).

### 2.7 Settings (owner)
New quality section:
- **Windowed cap** — 480p / 720p / 1080p / 1440p / 4K / No cap (default 720p)
- **Fullscreen cap** — same choices (default 4K)
- **Start quality** — which rung to start on before bandwidth is known *(default: lowest,
  for the fastest start — my call)*
- **Data saver** — forces 480p everywhere
- **Audio only on mobile** (opt-in, default off) — on the Mac: when the network is
  expensive (hotspot/cellular) or constrained (Low Data Mode) — `NWPathMonitor`
  `isExpensive` / `isConstrained`; in the iOS port (v1.1): on cellular. Switching it
  sets the existing audio-only state; it does not add a second one.
  **Back on a normal network (owner):** by default **restore the user's own choice** —
  if audio-only was off before the auto-switch, turn it off again; if the user had it on
  themselves, leave it on. A small badge shows when audio-only is on automatically. An
  opt-in setting replaces the restore with an **"ask me"** prompt ("Back on Wi-Fi —
  switch video back on?"). The engine must remember whether the current audio-only state
  was set by the user or by this rule.
- Podcast tracker toggle (§2.6).

### 2.8 Cold-path workstream (owner: ≤ 5 s cold is a hard target)
Measure first with the §2.1 timer, then, in order of expected payoff:
- **Fewer yt-dlp player clients.** A default run fetches the webpage plus `tv` and
  `visionos` player JSON (seen in `-v`). Test restricting clients via
  `--extractor-args youtube:player_client=…` / `player_skip=…` for extraction time AND
  for still getting usable audio-only + HLS formats (expected ~3 s → ~1.5 s, unverified).
- **Does HLS escape the URL lock?** Test whether the HLS master / variant / segment URLs
  are gated by `available_at` like progressive URLs. If not, a cold VIDEO click skips the
  gate entirely.
- If both together still miss ≤ 5 s, report the measured numbers and the remaining
  options (e.g. a persistent extractor process) before building further.

## 3. Non-goals / anti-goals
- Not downloading whole files ahead of time; pre-resolve fetches URLs, not media
  (beyond the 1-byte gate probe).
- Not pre-resolving every visible card.
- No hover-triggered podcast requests of any kind.
- Anti-goal: audio-only loading video bytes, or being slower than video.
- Anti-goal: a cache hit that plays a dead URL with no fallback (worse than slow).

## 4. Out of scope, tracked separately
- "Audio only" checkbox sometimes appears unchecked — owner unsure it is real; logged as
  a watch item, not built here.

## 5. Left to the builder
Ordering of phases inside the plan (the timer goes first), the cache's storage
(in-memory is fine), the dwell value, how the timer is surfaced, the tracker prefix list
beyond the ones named, and the HLS cap mechanism — subject to the §2.5 report-back rule.
