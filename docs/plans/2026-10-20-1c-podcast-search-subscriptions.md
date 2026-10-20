# Execution Plan — 1c: Podcast search, subscribe, refresh

_Authoring date: 2026-10-20. Roadmap parent: step 1c. Companion to the 1b plan._

### 🚨 System instructions

Same rules as the 1b plan (self-contained, receipts per phase, fixture-based tests,
commit-authorized / push-prohibited). Discovery findings first:

- `podcast_feeds` table exists (schema:289) with the matching `PodcastFeed` core type;
  `save_podcast_feed` in `podcast/mod.rs` builds the struct but its DB writes are
  commented out — the missing piece is a queries layer, not schema.
- The `channels.subscribe` command is a stub for ALL channel types (title
  "Loading...", insert commented out, `unsubscribe` too). Podcast-only scope for 1c;
  video-subscribe needs channel-metadata fetching and is recorded for 1d/2c.
- Frontend has no podcast search UI; wrappers in `useTauriCommands` + the
  source-derived contract test are the 1c frontend surface (UI design is 2a/2c).
- `parse_atom` is a stub that returns EMPTY data silently for Atom feeds — the
  `fetch_feed` detector must return an explicit Err for Atom instead of a
  silent-empty success (RSS 2.0 + JSON Feed cover the podcast ecosystem).
- Background `start_feed_fetching` is a log-only stub; refresh wires its real body.

### Design decisions

- **Directory: iTunes Search API** (`itunes.apple.com/search?term=&media=podcast`) —
  no key, no account; Podcast Index requires API keys and is deferred.
- **Podcast channel identity: the feed URL** is the stable external key for podcast
  channels (channel row `external_id = feed_url`, `type='podcast'`,
  `podcast_feed_url` set, `is_subscribed=1`).
- **Episode identity: the feed `guid`** — episodes upsert keyed by `external_id =
  guid` with `podcast_guid = guid` and `audio_url` set; existing rows untouched
  (same non-clobber rule as 1b).
- Refresh policy: feeds due when `is_active` and `last_fetched_at` older than
  `fetch_interval_minutes`.

### Phases (receipts per phase; tests fixture-based, live access one smoke)

1. **Search**: live-capture an iTunes response into
   `podcast/fixtures/itunes_search.json`; RED test (parse → hand-derived literals,
   malformed → err); GREEN `parse_itunes_search` + `search_podcasts` command.
2. **Subscribe**: live-capture one real podcast RSS feed, trimmed to 2 items
   (`podcast/fixtures/vergecast_feed.xml`); RED DB tests (subscribe upsert: channel +
   podcast_feeds row + episodes in ONE transaction, FTS-searchable, idempotent,
   non-clobbering); GREEN `upsert_podcast_subscription` in queries.rs + Database
   wrapper + `subscribe_podcast` command; Atom branch returns Err.
3. **Refresh**: RED test for `due_podcast_feeds` (active + stale → due; fresh or
   inactive → not); GREEN queries + Database wrapper + real body in
   `background_tasks::start_feed_fetching` + manual `refresh_podcasts` command.
4. **Frontend + gates**: wrappers `podcastCommands.search/subscribe/refresh` in
   `useTauriCommands.ts`; vitest + tsc + Playwright + cargo + contract mutation check
   (rename one wrapper key); live smoke `#[ignore]` tests for iTunes parse; commit;
   milestone review dispatch.

### Non-goals

Video-channel subscribe (needs metadata fetch — separate item), podcast playback UI
redesign (2a/2c), Podcast Index directory (needs keys), auto-download.
