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
