# EchoPrism — Design Decision Record

Product and architecture decisions made with the owner, newest last. Each entry names the
decision, the reasoning, and where it is implemented. Durable by design: this file is the
source of truth if a session is interrupted — resume from the bottom.

---

## D1 — Queue streams on demand; auto-download is opt-in (2026-10-15, owner)

**Decision:** Adding episodes (video or podcast) to the queue NEVER triggers a download.
Everything in the queue streams on demand. Downloading exists (S13, quality selector) and
feed-level auto-download exists as an explicit opt-in, but the default is streaming.

**Reasoning:** Most podcast players download on queue-add; with subscriptions linked across
YouTube + RSS (the Smart Episode Linking core case), that would be immensely storage-hungry —
both formats of the same episode arriving on disk.

**Implemented as:** `PlayerProvider.play()` resolves the stream at play time via
`stream_episode`; no queue-add path touches the downloader. Regression guard: the schema default
for `auto_download_wifi` shipped as `DEFAULT 1` (auto-download ON — a silent regression against
this decision) and was fixed to `DEFAULT 0` on 2026-10-15; the feed-level `auto_download` column
default is 0. Guard surface: `sql/schema.sql` column defaults + the migration-sql smoke test.

## D2 — Card click behavior: configurable, smart default (2026-10-15, owner)

**Decision:** What clicking an episode card does is a user preference with four values:
`auto` (default), `play_now`, `load_paused`, `queue`. The `auto` default is context-aware:
- Nothing currently playing → play it NOW (video or podcast — the user most likely wants it).
- Something already playing → ADD TO QUEUE; do not interrupt current media.
Playing NEXT must remain an explicit action regardless of the preference (card buttons:
"Play next" / "Add to end"), like RSS Radio's queue actions.

**Implemented as:** `card_click_action` column on `user_preferences` (DEFAULT 'auto'),
`CardClickAction` enum in echoprism-core, FeedScreen `handleCardClick` applying the rule,
radio group in Settings → Preferences.

## D3 — Position sync on format switch (pre-decided in architecture.md:505, confirmed 2026-10-15)

**Decision:** Switching audio↔video preserves playback position (restored from
`playback_state.position_seconds` on src change). F06 must-have.

**Implemented as:** PlayerProvider sync effect sets `activeEl.currentTime` from the store
whenever the stream src changes.

## D4 — Local-first queue and data; streaming architecture follows architecture.md (2026-10-15)

**Decision:** The queue is local client state (Zustand) for the vertical slice, consistent with
architecture.md's local-first principle ("All data local; no cloud sync by default"; instance-pool
mitigation row explicitly says "queue locally"). Backend queue persistence (`add_to_queue` etc.)
remains the designed end state — the frontend queue will sync through it once real data flows.

**Related deferrals (architecture-decided, milestone-gated):** Shaka Player for DASH/MSE video
(needs extractor DASH output — plain `<video>` is the slice substrate); auto-failover
mid-playback ("detect 403/404/timeout → pause → switch instance → resume"; the frontend toast is
the slice stand-in, the real retry belongs partly backend-side in the instance pool); Tauri
media-session plugin for background-audio lifecycle.

## D5 — Play() AbortError is not a playback failure (decided 2026-10-18, from e2e finding)

**Decision:** The media engine treats an `AbortError` from `activeEl.play()` as a
self-inflicted interruption (our own `pause()` racing the play promise during the
audio↔video element switch, or a user pause), NOT as a playback failure — it is
swallowed and playback state is left untouched. Only genuine rejections
(`NotAllowedError` autoplay block, unsupported media, etc.) flip `isPlaying` off.
An element's play() promise rejects with "interrupted by a call to pause()"
whenever pause() lands before playback actually started; treating that as failure
kills global playback during every element switch.

**Implemented as:** PlayerProvider sync effect's `play().catch` filtering
`DOMException.name === 'AbortError'`; unit tests cover both the swallowed
AbortError and the still-fatal NotAllowedError paths (commit 0c39698e).

## D6 — Smart links are resolved at search time, not in an idle batch (decided 2026-10-18)

**Decision:** When the user searches, results are smart-link-matched IMMEDIATELY:
any show with a known cross-stream presence (the same show published both as an
RSS podcast feed and as a YouTube channel) gets its results paired up front, so
every episode the user picks is already linked — regardless of which episode of
the pair they chose. The user's choice of an episode IS the match signal; waiting
for an idle background batch to catch up means the user first sees unlinked
results and the pairing arrives too late to matter.

The idle `trigger_smart_linking` background job (background_tasks) remains as a
secondary top-up (catching shows whose cross-stream presence was learned after a
search), but search-time matching is the primary path.

**Canonical examples (user-provided):**
- **The Vergecast** — podcast feed + YouTube channel, every episode on both.
- **Some More News / Even More News** — ONE show with two title families:
  YouTube-native episodes titled "Some More News…", podcast-native episodes
  titled "Even More News…", yet ALL episodes are available on BOTH streams.
  This is the pattern-matching stress test: matching must operate on the show,
  not on exact title equality (see D7 for the play-mode consequence).
- **Power User (Taylor Lorenz)** — podcast feed + YouTube channel.

**Implemented as:** read-time resolution in the backend — every `get_feed`,
`search_episodes` and `get_episode` response passes through
`resolve_smart_links` (src-tauri/src/db/queries.rs), which batch-queries
`episode_links` for the response's podcast_guids/video_ids and the episodes
table for the twins, then stamps `smart_link_id` + `linked_episode_id` on each
episode (keys omitted when unlinked, matching the mock router's
`withChannelAndLinks`). Search stays a title query — pairing rides the same
response (commit 0394e641; e2e e2e/f06-smart-links.spec.ts drives both
families + badges; Rust tests in queries.rs `d6_d7_tests`).

Review hardening (commit 954e6b61): a both-keys episode whose link resolves
back to itself is no longer stamped as its own twin (self-link guard in the
Rust resolver and the mock router). Open policy question: when several
episodes share one link key (e.g. two videos under one podcast_guid), the
resolver picks an arbitrary twin — disambiguating needs a rule the owner
hasn't chosen yet.

## D7 — Per-title-family default play mode (decided 2026-10-18, implemented 2026-10-19)

**Decision:** The card-click default (D2) can be overridden per title family
within a show: episodes whose title matches a video-family pattern play VIDEO by
default; audio-family patterns play AUDIO by default. First matching rule wins;
no match falls back to the channel default, then to D2's `card_click_action`.

**Driving example:** within Some More News (D6), episodes titled "Some More
News…" play video by default, while "Even More News…" episodes play audio by
default — the user watches the YouTube-native episodes and listens to the
podcast-native ones, without touching the toggle each time.

**Implemented as:** a `play_mode_rules` table (channel_id, title_pattern,
play_mode, priority; UNIQUE(channel_id, title_pattern)) with list/set/remove
commands (commit 0394e641); `resolveDefaultPlayMode` in
src/hooks/useEpisodePlay.ts consults matching → channel format_preference →
undefined in the card-click paths, and PlayerProvider's `play()` treats
the passed mode as an override over the global audio toggle while never
conjuring a capability the episode lacks (commit 4eb89dc1); rule editor UI in
Settings → Play Modes, per subscribed channel (commit aa264834).

Review hardening (commit 954e6b61): the override no longer REWRITES the
user's audio toggle — the engine splits a per-play `playbackFormat` (what
this playback resolves through; also drives PlayerScreen's render) from
`isAudioMode` (the standing preference), so an override cannot leak into
later plays. The `load_paused` path carries the chain mode too: a paused
load remembers the rule's format, and pressing play resolves it instead of
the toggle's default (D2×D7). Rule-list ordering gained a rowid tiebreaker
(1-second timestamp resolution), and schema-default `'both'` channel rows
decode via `Format::Both` instead of failing the whole list query.

Scope note: the chain feeds the card-click play-now and load-paused paths
only — queue items still carry `play_mode: 'unified'` and queue-advancement
doesn't consult rules yet; the rule editor has no priority control
(equal-priority rules resolve by creation order, oldest first). Tracked in
the P3 waypoint.
