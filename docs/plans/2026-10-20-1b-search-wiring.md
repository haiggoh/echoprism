# Execution Plan — 1b: Wire search (and stream resolution) to real sources

_Authoring date: 2026-10-20. Executor: the same free-lane session (inline execution)._
_Roadmap parent: `docs/plans/2026-10-19-release-roadmap.md` step 1b._

### 🚨 System instructions for the AI developer — read first

- This plan is self-contained; do not depend on a chat transcript. Revalidate live
  source and tool schemas before mutation.
- Output exactly three strategy sentences before file edits; then do read-only
  preflight. Preserve dirty work; stage commits by path.
- Prefer native read/search/edit tools; shell for git, builds, tests, runtime probes.
- Respect the authority matrix. Commit-authorized ≠ push/tag/release-authorized.
- Every phase ends with a real receipt (command, expected observation, exit status).
  Failure → STOP that phase, diagnose, rerun. Never weaken a test to go green.
- No secrets in receipts. Say "not tested" where a test cannot run.

### 📌 Context and objectives

**Project and verified source:** EchoPrism, `~/ClaudeWorkspace/echoprism`, Tauri 2 +
React/TS frontend + Rust backend. Verified live at commit `2d3d57e8` (master, 11 local
commits, clean tree except `node_modules/.package-lock.json`).

**Current behavior → required behavior:**

| Entry point | Now | Required |
|---|---|---|
| `search_episodes` command (`src-tauri/src/commands/episodes.rs:33`) | queries local SQLite only; with an empty DB returns nothing | also queries configured Invidious/Piped instances with failover, upserts results as episodes, returns the merged local+smart-link search |
| `stream_episode` (same file, line 51) | returns mock `https://example.com/stream/{id}` | resolves a real stream URL via `Extractor::get_stream_url` (instance first, yt-dlp fallback) |
| `InstancePool::initialize` (`instance_pool/mod.rs:41`) | never called — instances never load from DB at startup | called once at startup; exactly ONE health-check loop in the whole app |
| First run with no instances | search can never work | DB seeded with a small default set of public Invidious instances (user-removable via existing UI) |

**Evidence (live, verified this session):**
- Frontend already calls `invoke('search_episodes', { q, params })`
  (`src/hooks/useTauriCommands.ts:44`) and renders `Episode[]`; mock router at
  `src/mocks/router.ts:67`; contract test `src/__tests__/tauri-command-contract.test.ts`.
- Extractor has lookup-by-id and stream-resolution against Invidious
  (`/api/v1/videos/{id}`) plus yt-dlp fallback, but **no search method at all**.
- `db::queries` already merges smart links into search results (7 passing tests pin
  this; tests build their DB **without** an AppHandle — reuse their setup pattern,
  discover it by reading `d6_d7_tests` before writing DB tests).
- 30 build warnings; the extractor/podcast/sponsorblock surfaces are dead code until
  wired.

**Unknowns to inspect in Phase 0 (discovery, not guesses):** `Episode` type + episodes
table schema (how a YouTube video id is stored); `db.search_episodes` implementation;
`instance_pool` lines 120-260 (its own health loop vs `background_tasks`' — dedupe
decision); how frontend consumes search errors; exact Invidious/Piped search response
shapes (captured live into fixtures in Phase 1).

**Hard constraints and non-goals:**
- App must stay usable offline: network failure degrades to local results + a warn log,
  never a hard error.
- No new heavy dependencies: use `reqwest` (present) and `serde` (present). Do NOT
  adopt new search crates.
- Tests never hit the network — recorded JSON fixtures only. One live smoke at the end.
- Non-goals: podcast search (1c), play-mode/smart-link semantics (done, pinned by
  tests), frontend redesign (2a-2c), SponsorBlock (1c+), yt-dlp bundling.

**Acceptance criteria:**
1. `cargo test` green (all prior + new tests), frontend gates green (vitest, tsc,
   Playwright).
2. A live search for a real query returns video results in the app, sourced from a
   public Invidious instance, with automatic fallback when the first instance fails.
3. Clicking a result resolves a real stream URL (verified at the API/CLI level; manual
   playback check is the owner's).
4. Warning count does not increase; offline/instance-down path proven by test.
5. One milestone commit on `master`; nothing pushed.

### 🔒 Authority matrix

| Operation | Status | Gate/evidence |
|---|---|---|
| Read source, run builds/tests | allowed now | read-only or sandboxed |
| Edit Rust/TS source + fixtures | allowed now | stage by path; check-code clean |
| `cargo`/`npm` test commands | allowed now | local only |
| Live GET against public Invidious instances | allowed now | read-only search requests; no auth, no cost; rate-limit-friendly (single queries) |
| Commit to `master` | allowed now | full gates green first |
| Push / tag / release / publish | **prohibited** | owner's explicit say-so only |
| Add/remove yt-dlp, global installs | prohibited this plan | out of scope |

### 🛑 Phase 0 — forced preflight

**Objective:** establish source truth for the unknowns above before any mutation.
Three-sentence integration strategy first; then read-only inventory: rest of
`instance_pool/mod.rs`, `db/queries.rs` (`search_episodes` + `d6_d7_tests` setup +
episodes schema/migrations), `types.rs` (`Episode`, `Instance`, `InstanceType`),
frontend `SearchScreen`/`useTauriCommands` consumption, `mocks/router.ts:67`.
**🧪 Receipt 0:** the inventory outputs (or excerpts) pasted in the session log; git
status showing only expected dirty paths.

### 🏗️ Phase 1 — Extractor::search parses real response shapes

**Objective:** `Extractor::search(q, &Instance) -> Result<Vec<VideoInfo>, String>` that
speaks Invidious (`GET {base}/api/v1/search?q=&type=video`) and Piped
(`GET {base}/search?q=&filter=videos`, response wrapped in `items`) depending on
`InstanceType`, normalizing both into the existing `VideoInfo`.
**Tasks:** new response structs (search item shapes); reuse `self.client` (timeout,
UA) — note current methods wrongly build ad-hoc clients; keep the fix local. Capture
one live response per backend into fixture files under `src-tauri/tests/fixtures/`
(redact nothing — public search JSON has no secrets; trim to ≤3 items to keep files
small).
**Tests:** unit tests parse fixtures → assert normalized `VideoInfo` fields against
hand-derived literals (title of fixture item 0, duration, video id). **Discriminant:**
a planted malformed fixture (truncated JSON, missing `videoId`) must fail; restoring
the good fixture passes.
**🧪 Receipt 1:** `cargo test --lib extractor` output pasted; fixtures committed.

### 🏗️ Phase 2 — instances actually load at startup, exactly one health loop

**Objective:** `pool.initialize()` (or a reshaped load-only variant) runs in lib.rs
setup; default seed inserted when the instances table is empty; health checking exists
once (decide with the file fully read: `instance_pool::start_health_checks` vs
`background_tasks::run_instance_health_checks` — keep the one with failover logic,
delete the other spawn, and say so in the commit).
**Tests:** DB-level test: seed empty table → load → `get_all()` returns the seeds
(reuse the d6 tests' DB setup pattern); discriminant: empty-table run yields exactly
the default set, a pre-populated table yields no duplicates.
**🧪 Receipt 2:** test output + the startup smoke line showing the pool loaded N
instances (log line added if absent).

### 🏗️ Phase 3 — search_episodes orchestrates network → upsert → merged local search

**Objective:** command flow: resolve candidate instance URLs (pool, healthy first,
fallback order) → network search with per-instance timeout → upsert results as
episodes (source=youtube, external video id as the stable key, INSERT OR IGNORE-style
so history/queue rows are never clobbered) → run existing `db.search_episodes`
(smart links included) → return.
**Tasks:** make the HTTP fetch a small injectable boundary (fetch-by-URL function or
closure) so orchestration is testable without network; failure of ALL instances →
`tracing::warn!` + local-only results (no error to the UI); partial failure logs which
instance failed.
**Tests:** orchestration tests with fixture-backed fake fetchers: first-instance-fails
→ second succeeds (fallback), all-fail → local results returned, empty query guards.
**Discriminant:** reversing the fallback expectation must fail the test.
**🧪 Receipt 3:** `cargo test --lib` full output (all green), warning count not
higher than 30.

### 🏗️ Phase 4 — stream_episode resolves real URLs

**Objective:** `stream_episode` maps the episode to its video id, calls
`Extractor::get_stream_url` (instance first, yt-dlp fallback inside), returns real
`StreamInfo` (headers/format from the resolved stream). Mock branch deleted.
**Tests:** unit test the episode→video-id mapping and the StreamInfo assembly from a
fixture `StreamUrl`; live resolution deferred to Phase 5's smoke.
**🧪 Receipt 4:** test output; `grep example.com src-tauri/src` returns nothing in
episode/stream paths.

### 🏗️ Phase 5 — frontend contract + full gates + live smoke

**Objective:** keep the `search_episodes` invoke contract compatible (additive fields
only); update `mocks/router.ts` and `tauri-command-contract.test.ts` if shapes grew;
run the full gate suite; then one live end-to-end verification: launch the app
(15-20s, log-captured) or exercise the search path via a small ignored cargo test
against one public instance, and paste the query + result count + a resolved stream
URL prefix as the receipt.
**Tests:** `npm run test` (vitest), `npx tsc --noEmit`, Playwright suite, `cargo
test`, `cargo check` (warnings ≤ 30). **Discriminant:** the contract test must fail if
a command name is renamed (rename one in the test temporarily to observe red, then
restore).
**🧪 Receipt 5:** all gate outputs + live smoke log excerpt. Then ONE milestone commit
(staged by path), message per repo convention with both attribution trailers.

### 🧨 Adversarial review

- **Tempting shortcut:** hit the network in unit tests "just this time" → flaky,
  rate-limited CI. **Rule:** fixtures only; live access is one smoke. **Detect:**
  tests pass with networking disabled (not directly testable — accepted risk, noted).
- **Tempting shortcut:** call `pool.initialize()` as-is → TWO health loops (its
  internal spawn + background_tasks) double-probing instances every 5 min.
  **Rule:** exactly-one-loop invariant, decided in Phase 2 with both files read.
  **Detect:** startup smoke shows one "health check" cadence, not interleaved pairs.
- **Tempting shortcut:** INSERT OR REPLACE for upserts → clobbers user history/queue
  links. **Rule:** INSERT OR IGNORE on the stable external key. **Detect:** upsert
  test re-runs with mutated history row surviving.
- **Tempting shortcut:** search command errors when all instances fail → app useless
  offline. **Rule:** degrade + warn. **Detect:** all-fail orchestration test returns
  local rows.
- **Tempting shortcut:** parse Piped with the Invidious structs → silent field loss.
  **Rule:** separate item structs per backend, both normalize through tests with
  their own fixtures.
- **Risk not testable safely here:** long-tail instance breakage in the wild;
  mitigated by failover + user-manageable instance list.

### 🏁 Final review and delivery

At milestone close, answer in the session log: what shipped vs planned; which
receipts ran; tests unrun (if any); dirty work preserved; no secrets in receipts;
contract compatibility kept; stopped before push/tag/release. Update the roadmap doc's
"Where things stand" + "Next action" in the same commit, and report the milestone with
the offer to test search live (proceeding to self-test if no feedback arrives).

## Delivered (2026-10-20)

- Shipped, phases 0-5 as planned: the parse layer (Piped + Invidious + yt-dlp
  JSONL/array), startup instance loading with exactly one health-check loop, default
  instance seeding, the `search_episodes` orchestration (failover order, 8s
  per-instance timeout, yt-dlp fallback, graceful offline degrade), the
  non-clobbering video-id-keyed upsert feeding FTS + smart links, and a real
  `stream_episode`.
- Premise amended on live evidence: "instances with fallback" became "instances first,
  yt-dlp guaranteed fallback" — the official Invidious registry disables the public API
  on every listed instance (`api:false`, verified 2026-10-20). The Invidious fixture is
  doc-derived and labeled as such in its test.
- Receipts run: cargo 21/21 (+2 live smoke 2/2 against the real network), vitest
  116/116, tsc clean, Playwright 8/8, contract-test mutation check (red on a renamed
  command, green after restore), live Piped + yt-dlp searches parsed by the shipping
  code. `example.com` mock gone from stream paths.
- Boundary respected: nothing pushed, tagged, or released; working tree committed
  (implementation `60662edf`, this note in the phase-5 commit).
- Deferred: the milestone-wide Gemini adversarial review runs in the background — its
  findings fold forward as fix-forward commits. The playback-while-closed check from
  the close-to-Dock verification is now unblocked (search yields something to play).
