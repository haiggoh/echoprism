# Execution Plan — 1e: Clean up and harden

_Authoring date: 2026-10-20 (overnight run, after 1d). Roadmap parent: step 1e.
Recon done live via a 5-agent workflow (run `wf_4d9333dd-e09`); sections marked
PENDING land as those results are triaged._

### 🚨 System instructions

Same rules as 1b–1d (TDD RED→GREEN with mutation checks, receipts per phase,
commit-authorized / push-prohibited, staged by path, both attribution trailers,
adversarial review via `free-agents/bin/remote-agent-dispatch.py` Gemini 3.8
Flash with ≤4-line findings, triaged against real code).

### Discovery findings (verified live, 2026-10-20)

1. **Dependency debt (DONE, commit `18c0a1a6`).** The roadmap named three unused
   direct deps (`multipart`, `atom_syndication`, `axum`); the same 0-reference
   audit across ALL SIX workspace members found 13 more (`tower`, `tower-http`,
   `hyper`, `mockall`, `proptest`, `rstest`, `assert_cmd`, `predicates`,
   `quick-xml 0.31`, `ammonia`, `html-escape`, `stemmer`, `levenshtein`). All 16
   removed; the future-incompat warning class (buf_redux, multipart 0.18,
   quick-xml 0.17, typemap) is gone from the build; cargo 45/45 twice.
   `http`, `mime`, `rss`, `roxmltree` are used and stayed.
2. **Build warnings: 20 dead-code items in 4 clusters** (extractor's pre-1b
   stream path; podcast import/export + YouTube-subscribe scaffolds;
   SponsorBlock manager entirely unwired; commands/ filter fields the TS side
   may or may not send; db insert/delete_channel + get_best_instance).
   Dispositions per item PENDING (recon agent) — each becomes SUPERSEDED
   (delete), UNWIRED_FUTURE (keep, documented), or SHOULD_WIRE (wire it).
3. **The flaky test is unnamed anywhere** (roadmap 2026-10-19 says "the one
   flaky test"; no plan doc or remember file records it). Identified
   empirically: vitest ×3, Playwright ×2, plus a real-timer grep. PENDING
   (recon agent). cargo lib suite is deterministic in-memory SQLite — ran
   green twice back-to-back during the dep work.
4. **Recorded-real-responses debt is really the STREAM path.** 1b committed
   search fixtures (piped/invidious/yt-dlp) with parse tests; what has no
   recorded-response test is stream resolution (`get_stream_with_yt_dlp`,
   `get_stream_from_instance` + their normalizer structs — currently the
   dead-code cluster #2's largest block). Fixture captures PENDING (recon
   agent: real yt-dlp `-J` dump + real Piped `/streams/` body, ≤60 KB,
   truncation noted).
5. **Sequential refresh (1c deferral).** `refresh_due_feeds`
   (podcast/mod.rs) snapshots the due set then runs a plain `for` loop; one
   shared reqwest client (30 s timeout); per-feed isolation is already right
   (fetch Err → warn+continue; store Err → feed stays due, not counted;
   touch after upsert). Production pool max_connections(5), sqlx defaults
   (WAL, 5 s busy timeout). No test currently exercises refresh_due_feeds
   itself.
6. **New stub found during 1e recon: `smart_link_switch_episode`**
   (commands/episodes.rs) — registered Tauri command, `Ok(())` no-op;
   `useTauriCommands.ts:47` exposes it; no UI caller found in a first grep.
   Verdict PENDING (recon agent: wire/remove/defer per the D6/D7 design doc).
   **Triaged (recon + in-session verification): REMOVE.** Zero callers (Rust,
   TS, mock layer); the design-system `ui/EpisodeCard`'s clickable Link badge
   is never given `onSmartLinkClick` by any screen; D6 already stamps
   `linked_episode_id` on every read and the client-side engine (PlayerProvider
   F06 position sync) owns switching, so a link_id-taking backend command
   cannot fulfill its comment. Removal is contract-test-safe:
   tauri-command-contract.test.ts only LOGS unreferenced registrations
   (informational, :360-370) and the count floor (40) stays clear.
   **Same dead no-op class, same sweep:** `toggle_audio` + `smart_link`
   (commands/playback.rs:29-44, registered lib.rs:152-153, zero callers),
   the entire `playbackCommands` TS object (useTauriCommands.ts:62-68,
   zero references), and all five `commands/background.rs` trigger no-ops
   (registered lib.rs:185-189, wrapped at useTauriCommands.ts:116-120, zero
   UI callers — `trigger_smart_linking`/`trigger_feed_fetch` would be
   wireable to the now-real loops, but no roadmap step owns a "run now" UI;
   git history keeps them for when one does).

### Design decisions

- **Concurrent refresh, cap 4** (from the recon spec): extract the loop into
  `refresh_due_feeds_with(due, fetch)` with an injected fetch closure
  (`fetch_feed_with` already `pub(crate)` — production path unchanged, client
  cloned per future, never rebuilt per feed), body =
  `futures::stream::iter(...).map(...).buffer_unordered(4).filter(...).count()`
  — buffer_unordered drives futures inline on the caller's task, so the cap
  structurally bounds spawn (no tokio::spawn, no JoinSet). Cap 4: network-bound
  fetches, ≤4 parallel hits per host (RSS politeness), ≤4 concurrent write
  transactions < pool max_connections(5) < busy-timeout budget. Keep per-feed
  error-isolation match arms verbatim; `refreshed` counts fetch AND store
  success, unchanged semantics.
- **TDD for concurrency** (spec's honest answer: sequential vs concurrent has
  NO observable difference without injected latency — the RED must be
  structural): step 0 mechanical extraction stays GREEN; step 1 RED test
  `refresh_overlaps_fetches_up_to_cap` — 4 due feeds, injected closure tracks
  max in-flight via AtomicI64 + 50 ms sleep, asserts `max_in_flight == 4`
  (sequential can never exceed 1, regardless of machine speed), plus the
  semantics pins (count == 4, rows stored, every feed touched); step 2 GREEN
  with buffer_unordered(4); test B pins error isolation (failing feed does not
  block or count others; stays due); test pool needs max_connections ≥ 2.
  Single-flight guard for background-loop + manual-refresh interleave:
  recorded as optional hardening, out of scope.
- **Warnings policy**: delete SUPERSEDED with the commit naming what replaced
  it; keep UNWIRED_FUTURE with a one-line documented reason at the item
  (`// Unwired until step X: ...` next to the item or `#[allow(dead_code)]`
  with a reason string where the item is a whole cluster); wire SHOULD_WIRE.
  No silent `#[allow]` blankets.

### Phases (receipts per phase)

0. **DONE — commit `18c0a1a6`.** Dependency removal (finding 1).
1. **DONE — recon triage (workflow `wf_4d9333dd-e09`, 5 agents, 12 min).**
   Dispositions: 8 SUPERSEDED groups, 6 UNWIRED_FUTURE groups, 1 SHOULD_WIRE
   — with two triage corrections applied against real code (ImportResult is
   the return type of the kept import fns; InvidiousThumbnail is used by the
   1b invidious search parser). The switch-command verdict: REMOVE (zero
   callers on all three surfaces; D6 read-time linking + the client-side
   engine supersede it) — and it flagged the same no-op class: toggle_audio,
   smart_link, the whole background.rs trigger set, and the playbackCommands
   TS block. The recon also found: the seeded default instance is Piped and
   `get_stream_from_instance` spoke Invidious to it (404 → silent yt-dlp
   fallback on every play — a live-path bug, not just debt).
2. **DONE — commit `24f8d5c5`.** Piped streams branch wired
   (`/streams/{id}`, permissive recorded-response parser, numeric quality
   ranking) + the Invidious branch keeps its shape and stops building a
   `Client::new()` per call. Recorded fixture `piped_streams.json` (byte-exact
   real capture; audioStreams empty = PO-token gating → error → yt-dlp
   failover, as designed). 4 offline tests + the mutation check found the
   fixture's best tier sits LAST where max_by_key's tie-break masked a killed
   ranking → added an order-independent ranking test (RED under mutation).
   A live `#[ignore]` stream smoke (`live_stream_resolution_serves_a_playable_url`)
   resolves a real playable URL through the Piped branch — the 1b "live
   resolution deferred" note is closed; all 5 live smokes pass
   (`cargo test --lib -- --ignored`).
3. **DONE — commits `9cc1851f`+`ddf897ee` (no-op command sweep),
   `5afd285e` (dispositions), `bcda67c0` (type filter).** cargo build: 0
   warnings (was 20 + the future-incompat class; roadmap's "~22" was already
   stale at 20). Every kept item carries its reason at the site. The
   SHOULD_WIRE item (search type filter) is wired RED→GREEN with a
   mutation-checked clause, converted to a runtime QueryBuilder (dynamic
   WHERE + .sqlx cache rule). Sweep debris honesty: the type-filter mutation
   restore left an empty duplicate if-let that a later check caught —
   removed in `96554116`.
4. **DONE — commit `20fdcdae`.** Concurrent refresh: fetches overlap to cap
   4 (structural RED assertion: max observed in-flight — sequential code can
   never exceed 1), stores stay sequential (probe measured 2/4 concurrent
   upserts failing with immediate SQLITE_BUSY: deferred-upgrade deadlock
   avoidance, busy_timeout does not retry it, sqlx 0.7.4 has no
   BEGIN IMMEDIATE seam — the recon spec's risk-1 analysis was wrong on this
   point and the probe corrected it). Test pool is a temp-file DB (the
   :memory:+pool trap: each connection owns a private DB). Error-isolation
   test pins the failing-feed semantics.
5. **DONE — commit `e3758951`.** The flake did not reproduce (vitest ×3,
   Playwright ×2, all stable), so its identity stays unconfirmed — but the
   recon identified the strongest mechanism with evidence (fake-timers
   shouldAdvanceTime vs the Toaster's real 5 s auto-dismiss) and the
   assertion was hardened to the sibling's synchronous pattern (act flush →
   getByText). Runner-up mechanisms recorded in the recon output
   (/tmp/echoprism-vitest-run*.log): d7's 1 s waitFor ceiling under thread
   contention; settings-play-modes racing the same auto-dismiss; seed-script
   external-process 5 s default timeout.
6. **Gates (this receipt):** cargo 53/53 lib + 5 live `#[ignore]`, tsc clean,
   vitest 116/116, Playwright 8/8, tauri-command-contract 4/4 (both surfaces
   derived at test time after the removals). Roadmap updated below; review
   dispatch follows the commit. NEW FINDING for step 2 (recorded as waypoint
   `1c-step-4-debt-podcast-search`): 1c's plan step 4 never shipped —
   podcast search/subscribe/refresh have NO frontend wrapper and NO UI
   affordance, so subscriptions are unreachable from the app (mock-world
   tests pass on seed data while the real world cannot subscribe). Step 2
   owns the wrappers + the SearchScreen affordance.

### Non-goals

Wiring SponsorBlock or OPML import/export into the UI (no roadmap step owns
them before release; they stay UNWIRED_FUTURE with documented reasons unless
their disposition says otherwise), single-flight refresh guard, frontend
step-2 design work.
