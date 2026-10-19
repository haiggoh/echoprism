# D6 + D7 — Smart links at search time & per-title-family play modes

**Status: DONE (2026-10-19).** Receipts — Phase 1: b578e7ee (mock search resolves links,
search cards clickable); Phase 2: 0394e641 (play_mode_rules backend + read-time resolution in
Rust, commands, TS surface, fixtures, seed); Phase 3: 4eb89dc1 (resolveDefaultPlayMode chain in
useEpisodePlay, engine mode override, discriminating fixtures — a chain-bypass mutation is
caught); Phase 4: aa264834 (rule editor, tab named "Play Modes" rather than the plan's
"Channels" — SettingsScreen had no channels tab and the rules are the tab's subject); Phase 5:
fca0f88a (e2e/f06-smart-links.spec.ts + full regression 71 vitest / 7 playwright incl. axe /
5 cargo; pattern matching tightened to the spec's case-insensitive substring during Phase 5,
test mutation-checked). Post-plan adversarial review (2026-10-19) — 7 findings, all addressed in
954e6b61: D7 override no longer rewrites the audio toggle (per-play `playbackFormat` split from
the `isAudioMode` preference; render follows the engine format); `load_paused` carries the chain
mode (D2×D7, toggle-play resolves the rule's format); `Format::Both` decodes (real-shell rows
with the schema default no longer fail list_channels); rowid tiebreaker for same-second rules;
self-link guard (an episode is never its own twin; wrong-twin-among-shared-keys left as an open
policy question); channel `type` wire-name serde rename (+ contract test); rule-mutation failure
toasts (+ bridge-spy test). Regression after fixes: 75 vitest / 7 playwright incl. axe / 7 cargo,
tsc clean, build ok. Regressions: none — D1/D2/D3/F06 behavior unchanged; idle smart-linking job
untouched.
**Owner decisions:** design-decisions.md D6 + D7 (2026-10-18). This plan is self-contained;
revalidate live source before mutating.

## Context and objectives

**Project:** EchoPrism (`~/ClaudeWorkspace/echoprism`, local-only repo, work lands on `master`
as prior P3 commits did; NO push/tag/release — no remote exists).

**Current → required behavior:**

| Surface | Now | Required |
|---|---|---|
| Mock `search_episodes` (src/mocks/router.ts:38) | title-substring filter, no channel hydration, no link resolution | results hydrate `channel` AND carry `smart_link_id` (+ resolved twin) so any chosen episode of a cross-stream show arrives already linked (D6) |
| Rust `search_episodes` (src-tauri/src/db/queries.rs:565 → commands/episodes.rs) | plain SQL search, no link resolution | post-search link resolution: join `episode_links` by `video_id`/`podcast_guid`, set `smart_link_id` on results (D6 real-shell half) |
| SearchScreen result cards (src/components/screens/SearchScreen.tsx:92) | NOT clickable | clickable with D2 semantics; linked episodes show a both-streams badge (D6) |
| `PlayerProvider.play(episode)` | format chosen by audio-only mode + capability | accepts `{ formatOverride?: 'video' \| 'audio' }` (D7 output) |
| Card-click format decision (FeedScreen.handleCardClick, FeedScreen.tsx:44) | D2 only (auto/play_now/load_paused/queue) | consultation chain: per-channel title-family rules → channel `format_preference` default → D2 (D7) |
| Data | no play-mode rules; seed lacks the dual-title-family show | `play_mode_rules` table + commands; seed (mock + `db:seed`) gains Some More News / Even More News pair with 2 links + 2 rules |
| Settings UI | no rule editor | Settings → Channels: add/remove title-pattern → play-mode rules per subscribed channel |

**D7 precedence (owner-specified, binding):** first matching title rule wins → channel default
(`format_preference`; `'both'` = no override) → D2 `card_click_action`. Pattern semantics v1:
**case-insensitive substring** (owner examples are substrings: "Some More News" / "Even More
News"); regex deferred.

**Evidence ledger (verified live 2026-10-19):** `handleCardClick` FeedScreen.tsx:44-60;
mock handlers router.ts:28-99; mock fixtures data.ts (4 eps, 1 link `link-1` = ep-pod-1↔ep-video-1,
episodes do NOT carry `smart_link_id` yet); types Episode.smart_link_id (types/index.ts:136),
EpisodeLink (index.ts:152); command surface useTauriCommands.ts; SQL schema src-tauri/sql/schema.sql
(`episode_links` at :159, UNIQUE(podcast_guid, youtube_video_id)); matcher has batch
`match_all()` (src-tauri/src/matcher/mod.rs:69) used by idle `trigger_smart_linking` — stays as
secondary top-up (D6). Engine tests: src/__tests__/player-engine.test.tsx (12), suite total 44.
**Unknown to inspect while implementing:** exact PlayerProvider.play signature (src/components/PlayerProvider.tsx);
existing SettingsScreen channel-list patterns.

**Hard constraints:** D1 (queue-add never downloads); D2 semantics unchanged when no rule
matches; D6 idle job remains as top-up (not removed); local-first (rules live in SQLite, not
cloud); no new npm deps.

**Acceptance criteria:** (1) unit: mock search resolves links + hydrates channel; engine honors
formatOverride; rule consultation chain (rule > channel default > D2) — each with a
mutation-checkable discriminant. (2) e2e new spec f06: search "More News" → both title families
render with both-streams badges; clicking a "Some More News…" episode plays VIDEO, "Even More
News…" plays AUDIO. (3) cargo check + cargo test exit 0; vitest + build + axe green. (4)
design-decisions D6/D7 "Implemented as" updated; this file's Status finalized.

## Authority matrix

| Operation | Allowed | Gate |
|---|---|---|
| Read-only inspection | now | — |
| Edit repo files on `master`, commit by path | now | full vitest + build (+ cargo for backend phases) green |
| Run vitest / playwright / cargo check | now | — |
| Install dependencies | prohibited (none needed) | — |
| Push / tag / release | prohibited (no remote) | — |

## 🛑 Phase 0 — preflight (forced)

Three-sentence integration strategy, then read-only: `git status --porcelain` (expect clean at
plan start), confirm PlayerProvider.play signature, SettingsScreen channel UI, db:seed script
location. No mutation before that.

## Phase 1 — D6 mock layer + search click-through (frontend, TDD)

**Tasks:**
1. Extract D2 card-click logic from FeedScreen into `src/hooks/useEpisodePlay.ts`
   (returns `handleCardClick(episode)`); FeedScreen consumes it; behavior unchanged.
2. Mock router: shared `withChannelAndLinks(episodes)` helper — hydrates `channel`, and for each
   episode sets `smart_link_id` when a `db.smartLinks` entry joins it (podcast episode by
   `podcast_guid` ↔ link.podcast_guid; video episode by `video_id` ↔ link.youtube_video_id);
   add derived `linked_episode_id` (the twin's id via the same join). Apply in `search_episodes`
   AND `get_feed` (same helper; the feed shows the same cards — this is D6 applied where the
   user chooses, not a new feature).
3. SearchScreen: wire `onClick={handleCardClick}` on result cards; EpisodeCard renders a
   compact "A+V" both-streams badge when `episode.smart_link_id` is set (aria-hidden dot +
   visually-hidden text so axe stays clean).

**Tests (write first, watch fail):** unit `src/__tests__/search-smart-links.test.tsx` —
(a) mock search for the known guid returns the podcast episode WITH `smart_link_id` and
`linked_episode_id` pointing at the video twin; (b) unlinked episodes keep `smart_link_id`
undefined; (c) channel hydrated on search results.
**Discriminant:** mutation — delete the link-resolution join from the mock helper → (a) fails;
restore → passes.

## Phase 2 — D7 data: rules table, commands, seed (backend + mocks)

**Tasks:**
1. `src-tauri/sql/schema.sql`: `play_mode_rules(id TEXT PK, channel_id TEXT NOT NULL REFERENCES
   channels(id) ON DELETE CASCADE, title_pattern TEXT NOT NULL, play_mode TEXT NOT NULL
   CHECK (play_mode IN ('video','audio')), priority INTEGER NOT NULL DEFAULT 0, created_at,
   updated_at, UNIQUE(channel_id, title_pattern))`. Extend the migration-sql smoke test if it
   enumerates tables.
2. Rust: `src-tauri/src/db/queries.rs` list/set/remove + `src-tauri/src/commands/play_mode_rules.rs`
   (`list_play_mode_rules`, `set_play_mode_rule`, `remove_play_mode_rule`), registered in
   lib.rs `generate_handler!`. New queries use `sqlx::query` (runtime-checked) — NOT
   `query_as!` macros — to avoid regenerating the `.sqlx` offline cache; add a comment saying so.
3. `useTauriCommands.playModeRules` (list/set/remove) + TS types (`PlayModeRule`).
4. Mock handlers mirroring the three commands; fixtures: channels ch-3 "Some More News" (video,
   2 eps titled "Some More News: …" with video_id) + ch-4 "Even More News" (podcast feed, 2 eps
   titled "Even More News: …" with podcast_guid), 2 smartLinks pairing them, rules
   ("Some More News"→video on ch-3, "Even More News"→audio on ch-4). Extend `db:seed` SQL with
   the same rows (parity for the real shell).
5. D6 backend half: in `commands/episodes.rs::search_episodes`, after the query, resolve links
   for the result set (one query joining `episode_links` by video_id/podcast_guid) and set
   `smart_link_id` on returned episodes (mirrors the mock).

**Tests:** Rust contract test for the three commands (path exists: tests assert command
signatures — follow the file that guards lib.rs registrations); db test for rule round-trip.
**Receipt:** `cargo check` exit 0 from src-tauri/; `cargo test` green.

## Phase 3 — D7 engine: formatOverride + consultation chain (TDD)

**Tasks:**
1. `PlayerProvider.play(episode, opts?: { formatOverride?: 'video' | 'audio' })`: override wins
   over the audio-only/capability heuristic for the INITIAL element choice only; audio-only
   toggle still governs subsequent switches (F06 unchanged).
2. `useEpisodePlay` gains the D7 chain: fetch rules via react-query
   (`playModeRules.list()`), match `episode.title` against rules for `episode.channel_id`
   (case-insensitive substring, first by priority then insertion), else channel
   `format_preference` ('both' → no override), else undefined.
3. Seed/mock rules surface through the same path (integration covered by f06).

**Tests (first, in player-engine.test.tsx):** (a) play with formatOverride 'audio' on a
video-capable episode resolves the AUDIO stream; (b) override 'video' on a podcast-only
episode still falls back to audio (capability wins over override); (c) hook chain: rule match
overrides channel default; no rule + channel 'both' → D2 untouched.
**Discriminant:** mutation — drop the override read in PlayerProvider → (a) fails.

## Phase 4 — D7 Settings UI

Settings → Channels section: for each subscribed channel, list its rules (pattern → mode) with
remove buttons; an add form (title-contains input + video/audio radio + add button) calling
`set_play_mode_rule`. Reuse SettingsScreen's existing patterns. Accessible labels throughout.

## Phase 5 — e2e f06 + regression + docs

1. `e2e/f06-smart-links.spec.ts`: search "More News" → both families visible with badges;
   click "Some More News…" card (nothing playing) → player shows video playing; navigate back,
   click "Even More News…" card → audio path active.
2. Full regression: vitest, build, playwright (all specs), axe, cargo check/test.
3. Docs: design-decisions D6/D7 "Implemented as" + commit hashes; this file Status → DONE with
   receipts; P3 waypoint point.

## 🧨 Adversarial review (risks → mitigations)

- **sqlx macro compile break** (new `query_as!` needs fresh `.sqlx` cache) → new queries use
  runtime `sqlx::query`; macros untouched.
- **D2 regression in FeedScreen refactor** → extraction is behavior-preserving; existing f05 +
  engine tests guard; watch for the `isPlaying` read moving hooks.
- **Override fights audio-only toggle** → override affects initial choice only; engine test (a)
  pins it; F06 position-sync spec must stay green.
- **Mock/real drift** (rules consulted client-side but stored in SQL) → mock handlers mirror
  command names/shapes exactly; f06 runs against mocks; owner verifies real shell via db:seed.
- **Green-but-inert e2e** → f06 asserts element-level outcomes (which element plays), not DOM
  presence alone.

## 🏁 Final review checklist

All five phases receipted; no phase declared done on a skipped test; D1/D2/D3/F06 unchanged;
idle smart-linking job still present; commits staged by path with model trailers.
