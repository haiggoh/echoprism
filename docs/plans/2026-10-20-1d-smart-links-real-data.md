# Execution Plan — 1d: Smart links + per-title play modes on real data

_Authoring date: 2026-10-20. Roadmap parent: step 1d. Written after the recon below was
done live (read-only) at commit `3101913b`; revalidate line numbers before mutating._

### 🚨 System instructions

Same rules as 1b/1c (self-contained, receipts per phase, TDD RED→GREEN, commit-authorized
/ push-prohibited, commit staged by path with both attribution trailers). Adversarial
review per milestone via `free-agents/bin/remote-agent-dispatch.py` (Gemini 3.8 Flash,
findings ≤4 lines each, triage everything against real code).

### Discovery findings (verified live, 2026-10-20)

1. **Smart linking is inert end-to-end — this is the real 1d work.** Both matcher input
   queries are empty stubs: `get_unmatched_podcasts` (`db/queries.rs:1491`) and
   `get_youtube_videos` (`db/queries.rs:1497`) take `_pool` (unused) and return
   `Ok(Vec::new())`, with comments claiming the tables don't exist. But 1b/1c now store
   real rows in the ONE `episodes` table (`sql/schema.sql:103`: `external_id` = video id
   or feed guid, `video_id`, `audio_url`, `channel_id` → `channels.type`). So
   `EpisodeMatcher::match_all` (`matcher/mod.rs:69`) always iterates zero videos and links
   nothing; the hourly idle job and any UI trigger are no-ops.
2. `match_episodes`, `confirm_smart_link`, `unlink_smart_link` commands are also stubs
   (`commands/smart_links.rs:16-40`) — no user-facing trigger or review path exists.
3. `matcher/mod.rs:181` `normalize_text` keeps words that ARE stop words
   (`filter(|w| … && self.stop_words.contains(*w))` — inverted); feeds only the Jaccard
   fallback of `title_similarity`.
4. `title_similarity` normalization is suspect: SkimMatcherV2 score ÷ max(title lengths)
   is not a 0-1 similarity and likely under-ranks long real titles vs `min_confidence`
   0.7. Weight sum is 1.2 clamped to 1.0; `content_similarity` is a constant 0.5.
5. Play-mode defaults with real data: every channel gets `format_preference='both'`
   (schema default `schema.sql:85`; podcast subscribe sets Both `podcast/mod.rs:319`;
   `commands/channels.rs:39`) → the D7 chain falls through to D2 `card_click_action` for
   every real channel; per-title rules are the only override lever today.

### Design decisions (proposed — confirm against live source in Phase 0)

- Wire the two stub queries to the `episodes` table: video side = rows with `video_id`
  set (join channels for titles), podcast side = rows with `audio_url`/guid, each
  excluding ids already present in `episode_links`. Map into the existing
  `PodcastEpisode`/`YoutubeVideo` types; no schema change.
- Fix `normalize_text` (drop stop words, keep content words) and re-derive the
  `title_similarity` normalization; recalibrate `min_confidence` against real title
  pairs from the three shows, captured as committed fixtures (also feeds 1e's
  "recorded real responses" test debt).
- `match_episodes` wires to `matcher.match_all()` (matcher is app state — see
  `background_tasks/mod.rs:14` for the accessor pattern).
- Play-mode verification: with real subscriptions, per-title rules must send
  "Some More News: …" (YouTube) to video and "Even More News: …" (podcast) to audio;
  decide the default for channels carrying both streams and record it.

### Phases (receipts per phase; tests fixture-based, live access one smoke)

0. **DONE (2026-10-20, pre-handover recon session).** Fixtures committed:
   `podcast/fixtures/itunes_{vergecast,some_more_news,power_user}.json` (real feed
   URLs), `podcast/fixtures/{some_more_news,even_more_news,power_user}_feed.xml`
   (trimmed RSS; the even_more_news anchor feed returned only 1 item — young feed),
   `extractor/fixtures/yt_search_{vergecast,some_more_news,power_user}.jsonl` (top-3
   videos each: id, title, duration, timestamp, channel). Pairing shapes in REAL
   data: Vergecast YouTube titles = podcast title + " | The Vergecast" (near-identical
   — easy pairing); Some More News YouTube "JD Vance's Town Hall Was a Disaster" ↔
   podcast "Even More News: JD Vance's Town Hall Was a Disaster" (prefix relationship
   — exactly the D7 mock shape; per-title substring rules match real titles); the
   art19 Some More News feed also carries "Some More News:"-prefixed video-version
   items; Power User YouTube titles mostly OMIT the show name (the channel carries
   the identity) — title-only matching will under-pair there, so channel/date/
   duration signals matter. Durations + pubDates are in the fixtures for the scorer.
   Phase 1 starts from these.
1. Wire the two queries (TDD on a temp DB: seeded episodes → matcher input lists;
   discriminant: already-linked episode excluded).
2. Matcher fixes + recalibration against real-title fixtures (RED for the right
   reason: real Vergecast pair must score ≥ threshold; inverted-filter discriminant).
3. Unstub the three commands + contract test.
4. Live smoke on the three shows: subscribe (iTunes), search (yt-dlp/Piped), run the
   matcher, print the pairings; verify D7 play-mode chain on real titles; re-run the
   playback-while-closed check from the close-to-Dock verification.
5. Gates (cargo, vitest, tsc, Playwright, contract mutation check) + roadmap
   "Where things stand" + review dispatch + commit.

### Non-goals

Regex title rules, transcript TF-IDF content similarity, Podcast Index directory,
link-review UI design (2a/2c), channel format_preference UI (2a/2c), video-channel
subscribe (needs metadata fetch).
