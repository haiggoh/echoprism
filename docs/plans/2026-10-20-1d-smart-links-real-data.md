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
   Phase 1 starts from these. _Phase 4 note: the even_more_news fixture had a
   capture artifact (duplicated `</channel></rss>` closers on the last line,
   unparseable); repaired 2026-10-20 during 1d, now parses (1 item)._
1. **DONE — commit `54785734`.** Both queries wired to the one `episodes`
   table (podcast side: `podcast_guid IS NOT NULL`; video side:
   `video_id IS NOT NULL`; either excluded via `NOT EXISTS` against
   `episode_links`), channels joined for titles, runtime `query_as` (no
   `query_as!` macros — .sqlx cache rule). `YoutubeVideo.id` carries the
   external video id because the matcher writes it as
   `episode_links.youtube_video_id`, which D6 resolution matches against
   `episodes.video_id`. Tests: 4 (both inputs, both exclusions), RED on the
   stubs (all four — the "excluded" ones assert the unlinked sibling
   survives), GREEN after; exclusion clauses mutation-checked (dropped
   WHERE → red → restored).
2. **DONE — commit `c8e9d1a7`.** Pure `Scorer` extracted (dead
   `pool`/`extractor` fields removed); `normalize_text` inverted filter
   fixed (mutation-checked: re-invert → 2 tests red); `title_similarity` =
   Jaccard over content words, fuzzy secondary. Calibration matrix
   (`cargo test --lib calibration_matrix -- --nocapture`): real pairs
   0.8–1.0, cross-show 0.0. Weight sum normalized to 1 (was 1.2 clamped);
   constant-0.5 content term removed; `min_title_similarity` now a real
   gate. `min_confidence` 0.7 → 0.65 initially (Vergecast shape lands
   lowest: search videos have no absolute date, this feed has no
   durations → both signals neutral 0.5). Stop list probed, not assumed:
   the crate's ISO list (1298 words) really contains "problem";
   all content nouns the pairs rely on survive.
3. **DONE — commit `3321481e`.** `match_episodes` runs the real matcher
   from app state; `confirm_smart_link`/`unlink_smart_link` delegate to new
   `set_episode_link_confirmation`/`delete_episode_link` (unknown id →
   error, never silent success). Mutation check found a REAL test blind
   spot: on an empty table a WHERE-less UPDATE also affects 0 rows, so the
   unknown-id test passed a dropped-WHERE mutation for the wrong reason —
   fixed by seeding; the flip test asserts a second link stays untouched.
   MatchResult wire key `matched_count` pinned to the TS contract
   (useTauriCommands.ts:73).
4. **DONE — commit `8fa557c0`.** Live smoke (`cargo test --lib -- --ignored
   live_three_show --nocapture`, ~10s): real iTunes search + feed fetch +
   subscribe (1098/531/230 episodes) + yt-dlp search (15 video rows) →
   matcher ran over 1859×15. First run found TWO defects the fixtures
   missed: (a) fuzzy normalization saturated — SkimMatcherV2 scores ~16 per
   matched char, not ~2, so ANY subsequence match scored 1.0 ("phone"
   paired "rip mitch mcconnell"); fixed with coverage-based fuzzy (matched
   chars / longer string, both directions). (b) titles whose content words
   collapse below two distinct words (ISO list eats "part"/"two"/
   "computer") paired at jaccard 1.0 on the show name alone ("The Vergecast
   Vergecast, part two" ↔ "The AI is in the computer"); fixed with a 0.5
   cap on one-word evidence — below the title gate, needs human confirm.
   Gates recomputed together (they must agree): weights 0.7/0.1/0.1/0.1
   (sum 1.0), `min_confidence` 0.6 — with search rows' neutral
   date+duration the confidence floor implies title ≥ 0.64, so the 0.7
   title gate always dominates; thinnest real shape scores 0.675 (margin
   ≥ 0.075 both directions). Final live run: **7 pairings, all genuine
   same-episode pairs** (2 Vergecast, 1 Even More News prefix, 4 Some More
   News suffix), zero false pairs; linked guids drop out of the next
   matcher run (live re-check of the Phase 1 exclusion). D7 shapes: 205
   real "Even More News: " podcast titles, 9 rule-matching video titles —
   the per-title-rule shapes exist in real data; the chain resolution
   itself is covered by `src/__tests__/d7-play-mode-chain.test.tsx`.
   Playback-while-closed re-run (automated): built app launched, window
   closed via AXCloseButton → 0 windows, process alive, background loops
   still logging; Cmd+Q quits cleanly. Residue honestly out of machine
   reach: the audible "audio keeps playing" confirmation stays
   owner-observable (webview hides, does not destroy —
   `prevent_close` + `hide()` in lib.rs — so the HTML media element
   survives). Minor note: the AppleScript `quit app` AppleEvent did not
   quit the app within 3s; Cmd+Q (the user path) does.
   Future work recorded: anchor feeds publish `<itunes:duration>` (seen in
   the repaired fixture) but `parse_rss` ignores it — podcast durations are
   always None from RSS parse, leaving duration neutral in scoring.
5. **DONE (2026-10-20).** Gates: cargo 45/45 lib + 4 live `#[ignore]`
   (three 1b/1c smokes + the 1d three-show smoke), tsc clean, vitest
   116/116, Playwright 8/8, contract mutation check (serde rename
   `matched_count` → red → restored → green). Adversarial review dispatched
   (Gemini 3.8 Flash, full 1d diff, 1504 lines): **NO FINDINGS** — first
   dispatch was void (patch exceeded the 48 KB attachment cap and was not
   sent; re-dispatched with `--max-file-chars 80000`, file attached).

### Non-goals

Regex title rules, transcript TF-IDF content similarity, Podcast Index directory,
link-review UI design (2a/2c), channel format_preference UI (2a/2c), video-channel
subscribe (needs metadata fetch).
