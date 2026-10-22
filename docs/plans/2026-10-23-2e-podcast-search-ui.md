# Execution Plan — 2e: Podcast search from the UI (closes 1c's step-4 debt)

_Authoring date: 2026-10-23 (GLM 5.3 Flash free session). Roadmap parent: the
"Next action" list between 2d and step 4 — item 1, waypoint
`1c-step-4-debt-podcast-search`. Handoff:
`docs/plans/2026-10-22-handoff-glm-flash.md`._

## Context and objectives

**Project:** EchoPrism (`~/ClaudeWorkspace/echoprism`), Tauri 2 + React 19 +
TypeScript 5.9.3, all work on `master`, nothing pushed.

**Verified current behavior (2026-10-23, source + live):**

- The backend is complete and registered: `search_podcasts` → iTunes Search API
  (no key), `subscribe_podcast` → one-transaction channel+feed+episodes
  persist, `refresh_podcasts` → manual refresh trigger
  (`src-tauri/src/commands/podcasts.rs`, registered in `lib.rs:146-148`).
- **Nothing in `src/` calls either** (zero references) — the Search screen only
  filters the local DB (`SearchScreen.tsx` → `search_episodes` → FTS), so
  searching "Vergecast" surfaces only YouTube videos that yt-dlp happened to
  store, never the podcast directory.
- `get_feed` (Rust) filters by channel TYPE only (`FeedParams`: `type`,
  `limit`, `offset`); there is no per-channel episode listing anywhere, so even
  after a subscribe the UI has no honest way to "list the feed's episodes".
- The mock world (`src/mocks/router.ts`) rejects unknown commands, so the
  browser/e2e dev world has no podcast search at all.
- TS types `PodcastSearchResult` and `SubscribedPodcast` already exist
  (`src/types/index.ts:351-363`) — the frontend contract predates the wiring.
- A live iTunes smoke test already exists and is seeded with "vergecast"
  (`podcast/mod.rs:600`, `#[ignore]`).

**Discovered defect, deliberately NOT fixed in this milestone (scope):**
podcast episodes cannot play through the REAL backend. `stream_episode`
(`commands/episodes.rs:133`) resolves via `extractor.resolve_stream(video_id)`
— for a subscribed podcast episode `video_id` is None, so it falls back to
`external_id`, which is the RSS **guid**, and yt-dlp receives a non-YouTube id
→ error. The episode's direct `audio_url` enclosure (stored by 1c) is never
consulted; the e2e path only works because the mock router returns
`audio_url`. Recorded as a waypoint + roadmap known gap; owner decides when.

**Required behavior:** searching in the app shows iTunes podcast-directory
results alongside the local/video results; a Subscribe action persists the
subscription and then lists that feed's episodes in the UI. Live-smoke
criterion (handoff): for "Vergecast", the podcast feed AND the videos must
both appear.

## Design decisions (owner rule 1: decided, not asked — recorded here)

1. **Placement — a section, not a new tab.** A "Podcast directory" section
   renders on the Search screen when the active filter is `all` or `podcast`,
   below the local-results grid. Rationale: the live-smoke criterion must hold
   on the DEFAULT tab (`all`) without a filter switch; the `podcast` tab gives
   the focused view. Filters `video`/`queue` show no directory section.
2. **iTunes is queried on submit, not per keystroke.** The local FTS search
   keeps its existing per-keystroke behavior; the directory query keys on a
   `submittedQuery` state updated only on form submit. iTunes is a third-party
   API with rate limits — a keystroke-mirror would be abusive to it and slow.
3. **"Then lists the feed's episodes" = inline, via a new `channel_id` filter
   on `get_feed`.** After a successful subscribe the card shows a subscribed
   state and lists that channel's episodes (from `get_feed { channelId }`),
   each clickable through the shared D2/D6/D7 card-click chain
   (`useEpisodePlay`). A per-channel listing is the honest primitive; it is
   small and reusable (Channels screen will want it too).
4. **`get_feed` becomes a QueryBuilder query** (dynamic WHERE for
   type/channel), matching the documented convention in `search_episodes`
   (`queries.rs:903`) — changing the `query_as!` macros would demand
   regenerating the committed `.sqlx` offline cache, which this repo should
   not need for a dynamic filter.
5. **Mock semantics mirror Rust:** `subscribe_podcast` accepts only known
   fixture feed URLs (the real backend fetches any URL; the mock has no
   fetcher and must fail honestly), is idempotent on re-subscribe
   (0 new episodes, same channel_id), and creates episodes playable in the
   browser (`/mock-media/generic-audio.wav`, which exists).
6. **Naming:** the milestone is "2e" — frontend work in the step-2 family
   closing 1c debt.

**Offload annotation (plan level):** all implementation phases run on this
session's model (cloud, free lane) because they are interactive TDD with tight
verification loops; the ONE designated offload is the standing-rule-4
adversarial review, dispatched to `gemini-3.8-flash` via
`remote-agent-dispatch.py`. Zero local-model dispatch steps — the review IS
the offload, and spinning up local sessions for tightly-coupled TDD edits
would add overhead, not save cost.

## Authority matrix

| Operation | Status | Gate/evidence |
|---|---|---|
| Read-only inspection | Allowed now | done in preflight |
| Edit `src-tauri/`, `src/`, `e2e/`, docs | Allowed now (master, staged BY PATH) | owner rule 2; no running build checked 2026-10-23 |
| Commit milestones | Allowed (trailers: harness line + `Co-Authored-By: GLM 5.3 <noreply@z.ai>`) | model verified against the live proxy-4141 config |
| Push / tag / release / publish | **PROHIBITED** | owner rule 2 |
| Live iTunes GET (search, limit ≤10) | Allowed | keyless public API, read-only; existing 1c smoke precedent |
| Run app / install deps | Not needed | mock + cargo/vitest/playwright cover the contract |
| Never touch ports 4141-4151, never `remote-session.sh --stop` | PROHIBITED | owner rule 8 |

## Phases

### Phase 1 — Rust: per-channel `get_feed` (TDD)

- **RED:** new db test `get_feed_with_channel_id_returns_only_that_channel`
  in `db/queries.rs` tests: seed via `migrations::run` + a REAL
  `upsert_podcast_subscription` call (production path — standing rule 11, no
  hand-seeded rows), insert a second subscription, then
  `get_feed(Some(FeedParams { channel_id: Some(first), .. }))` must return
  exactly the first feed's episodes. Fails to compile (field missing) → add
  `#[serde(rename = "channelId")] pub channel_id: Option<String>` to
  `FeedParams`; then fails at runtime (filter ignored) → implement.
- **Implementation:** rewrite `get_feed`'s two `query_as!` branches as ONE
  QueryBuilder with optional `c.type = ?` and `e.channel_id = ?` binds,
  preserving `ORDER BY e.published_at DESC LIMIT ? OFFSET ?` and the existing
  row mapping. Contract note: the serde rename is required because Tauri
  camelCases only TOP-LEVEL args; nested struct fields follow serde defaults.
- **Mutation check (owner rule 3):** delete the channel WHERE push → test
  RED; restore, verify `cmp` byte-identical to the pre-mutation copy, GREEN.
- **🧪 Receipt 1:** `cargo test --lib` (parallel by default) — new tests pass,
  prior 64/64 unbroken; mutation RED/restore GREEN captured.

### Phase 2 — TS wrappers + mock handlers + fixtures (TDD)

- `podcastCommands = { search(term), subscribe(feedUrl, title?) }` in
  `useTauriCommands.ts`; `episodeCommands.feed` params gain `channelId`.
- Mock fixtures (`src/mocks/data.ts`): a `podcastDirectory` list (2 shows with
  feed_url, author, genres, artwork) + episodes per feed. Mock handlers
  (`src/mocks/router.ts`): `search_podcasts` (substring match on
  title/author/genres), `subscribe_podcast` (creates podcast channel +
  episodes; idempotent; errors on unknown feed_url or empty URL — mirrors
  Rust's empty-URL guard), `get_feed` honors `channelId`.
- **Vitest (new `podcast-directory.test.ts`):** search matches by term and
  ignores case; subscribe returns `{channel_id, title, new_episodes}` and the
  episodes become visible via `get_feed { channelId }`; second subscribe →
  `new_episodes: 0`, same channel_id, no duplicate rows; unknown URL rejects;
  empty URL rejects.
- **Mutations:** (a) make the mock subscribe handler append duplicates →
  idempotence test RED; (b) drop the term filter → search test RED. `cmp`
  guards both restores.
- **🧪 Receipt 2:** vitest run green including the new file; contract test
  auto-verifies the new wrappers against the Rust signatures (derive-at-test).

### Phase 3 — SearchScreen directory section (TDD)

- New `usePodcastDirectory` logic inside `SearchScreen.tsx` (or a sibling
  component `PodcastDirectorySection.tsx` — decide at implementation, keep
  SearchScreen under its current complexity):
  - `useQuery(['podcast-directory', submittedQuery, filter])`, enabled when
    `showResults && submittedQuery.length >= 2 && (filter === 'all' ||
    filter === 'podcast')`.
  - Section markup: `h2` "Podcast directory" (2b's axe gate requires
    headings), result cards with artwork, title, author, genres, and a
    Subscribe `button` with an accessible name per show.
  - `useMutation(subscribe)`: success → toast ("Subscribed — N new episodes",
    existing `useToasts`), invalidate `['search']` queries, set the card's
    subscribed state, then fetch `episodeCommands.feed({ channelId })` and
    render the episode list; rows click through `handleCardClick`.
  - Loading/error/empty states for the section (2c convention); section
    hidden when the directory query returns nothing.
- **Vitest (jsdom, `stub-screens-wired` pattern):** submit a query →
  directory section renders with fixture cards; on `video` filter the section
  is absent; clicking Subscribe shows the subscribed state and the feed's
  episodes; directory empty → section hidden.
- **Mutations:** (a) remove the filter gate → the 'video'-filter test RED;
  (b) remove the episode-list fetch → the episodes assertion RED. `cmp`
  guards.
- **🧪 Receipt 3:** vitest green; mutation RED/restore GREEN captured.

### Phase 4 — e2e + full gates

- Extend `e2e/f04-podcast.spec.ts`: search a term with a fixture directory
  hit → card visible → Subscribe → episodes list appears (mock world,
  headless-safe; playback NOT asserted — real-backend playback is the
  recorded defect above).
- Gates (owner rules; run in this order): `cargo test --lib` (parallel),
  `./node_modules/.bin/tsc --noEmit` (NEVER `npx tsc` — rule 9), vitest run
  (parallel), Playwright full suite.
- **🧪 Receipt 4:** all four gates green with counts; any red → STOP,
  diagnose, fix, rerun.

### Phase 5 — Live smoke + adversarial review

- `cargo test --lib -- --ignored` (live network): the 1c iTunes smoke
  ("vergecast") plus the 1b/1e yt-dlp smokes — proves the live "podcast feed
  AND videos" criterion at the backend level. The in-app live check remains
  owner-verify (recorded).
- Adversarial review (owner rule 4): dispatch the milestone diff to
  `gemini-3.8-flash` via `~/ClaudeWorkspace/free-agents/bin/
  remote-agent-dispatch.py --provider gemini --model gemini-3.8-flash
  --allow-remote-files --files <patch>`; triage EVERY finding against the
  real code; fix what survives; re-run the affected gates.
- **🧪 Receipt 5:** live smoke output; review findings + dispositions.

### Phase 6 — Records and close-out

- Receipts into this plan; roadmap "Where things stand" entry + updated
  "Next action"; waypoint `1c-step-4-debt-podcast-search` → done with
  evidence; NEW waypoint for the podcast-playback defect; the handoff's
  owner-verify list reproduced in the final report.
- **🧪 Receipt 6:** docs committed; `waypoints.py done` accepted with
  evidence; store reconciled at wrap-up.

## Adversarial review (pre-written risks)

- **Tempting shortcut:** send `channel_id` as a top-level invoke arg →
  consequence: contract test mismatch (it must be inside `params`) → rule:
  mirror `get_feed`'s existing `params` envelope → receipt: contract test.
- **Shortcut:** rename-free `channel_id` struct field → serde expects
  snake_case inside nested structs, the camelCased payload key never matches
  → silent empty results → rule: `#[serde(rename = "channelId")]` → receipt:
  Rust test asserting the filtered row set.
- **Shortcut:** "Subscribed" state kept only in React state → stale after
  query invalidation → rule: derive subscribed-state from mutation success
  keyed by feed_url and re-derive from the episodes query where possible →
  receipt: jsdom test re-render after invalidation.
- **Shortcut:** mock subscribe accepting any URL → e2e passes while the real
  contract (fetch-or-fail) is untested → rule: mock errors on unknown URLs →
  receipt: mock test.
- Cannot be tested safely here: WKWebView's real iTunes fetch from inside the
  Tauri shell (CSP/network egress) — owner-verify.

## Non-goals

`refresh_podcasts` wrapper (background task covers refresh), podcast episode
playback against the real backend (recorded defect), OPML import UI, light
theme, play-preview-on-hover (owner: after first release).
