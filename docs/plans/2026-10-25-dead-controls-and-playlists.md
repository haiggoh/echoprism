# Execution Plan — dead controls, unwired backends, playlists, D7 queue resolution

- **Date:** 2026-10-25
- **Parent:** `docs/plans/2026-10-23-first-release-plan.md` (phases A–H done) and
  `docs/plans/2026-10-19-release-roadmap.md`.
- **Trigger:** owner asked to pick up EchoPrism development and work open
  waypoints plus undelivered roadmap items. Discovery found the roadmap's
  *executable* scope complete, its *gap* list stale (three items already fixed
  in Phase B, commit `3283f02c`), and **seven defects no plan ever
  inventoried**. This plan covers the executable findings.

## Owner decisions (2026-10-25, verbatim intent)

1. **Bundle:** all of it — wire, delete, complete backends, and the D7
   semantic fix. Not cleanup-only.
2. **Buttons with no working backend** (#3 "Import from YouTube", #5 "Save as
   playlist"): **complete the backends rather than hide the buttons.**
3. **D7 resolution timing (#6):** resolve the play-mode rule **at play time**
   (lazy), not at queue time. `queueItemFromEpisode` keeps `play_mode:
   'unified'`; the rule is consulted on card-play *and* queue-advance alike.

## Confirmed live facts (verified 2026-10-25 in this session)

| Fact | Evidence |
|---|---|
| vitest baseline | 212 passed / 212, exit 0 |
| cargo baseline | 90 passed / 0 failed / 6 ignored, exit 0 |
| `src/components/ui/QueueItem.tsx` has **zero importers** | `grep -rln 'ui/QueueItem' src/` → 0 files; live queue renders `src/components/queue/QueueItem.tsx` |
| Onboarding is user-reachable | `App.tsx:27-30` navigates to `/onboarding` when onboarding is incomplete |
| Onboarding "Import from OPML file" backend exists | `channelCommands.import('opml', data)` (`useTauriCommands.ts:34`), already wired in `SettingsScreen.tsx:440` |
| `import_from_youtube` is a stub whose insert is commented out | `podcast/mod.rs:311`; `// self.db.insert_channel(&channel).await?;` at line 354, so it returns `imported: N` without writing |
| No playlist concept exists | `grep -rin playlist` → 14 hits, all yt-dlp flags (`--flat-playlist`, `--no-playlist`) or marketing copy |
| No `playlists` table | `CREATE TABLE` list in `sql/schema.sql` (15 tables, no playlists) |
| Settings > Smart Links tab is a stub | `SettingsScreen.tsx:565` dead "Run Matching"; renders `<EmptyState variant="feed" />` only |
| A real Smart Links surface exists | `/smart-links` route + `SmartLinksScreen.tsx` with working `match`/`confirm`/`unlink`; sidebar nav item `Sidebar.tsx:13` |
| `queueItemFromEpisode` hardcodes `play_mode: 'unified'` | `useEpisodePlay.ts:15`; rules consulted only at `:96` and `:102` |
| Schema is applied from `include_str!` SQL, not numbered migrations | `db/migrations.rs:22-34`; `migrate_data` at `:39` |
| `Database::pool()` is public | `db/mod.rs:19` |
| `insert_channel` does **not** dedupe | `queries.rs:554` inserts unconditionally (contrast `register_podcast_feed` at `:1286`, which checks `external_id` first) |

## Dated observations (not re-verified; treat as claims to check)

- Roadmap gap list at `2026-10-19-release-roadmap.md:336-341` is stale — the
  three items it carries forward were fixed in Phase B.
- Waypoint `echoprism-one-unreproduced`: one vitest flake seen 2026-10-24
  (`1 failed | 211 passed`), three reruns 212/212, test name lost. **This plan
  does not chase it**; it is a separate diagnostic item.

## Hard constraints and non-goals

- **Non-goals:** the `v*` tag, the Homebrew cask fill, Pages, and Phase I
  owner-verify (sound, media keys, Now Playing) are owner-gated and stay out
  of this plan. No iOS work.
- No new dependencies: playlists use the existing sqlx + SQLite stack.
- The repo's standing rules apply: TDD (red for the right reason),
  `/check-code`, `cmp`-guarded mutation checks, per-milestone review,
  path-staged commits on `master`.
- Nothing in this plan may ship a control that reports success for work it did
  not do — that is the exact defect being fixed in `import_from_youtube`.
- **Never** `git add -A`; stage by path. `node_modules/.package-lock.json` is
  already modified in the working tree and is NOT part of this work.

## Acceptance criteria

1. No `onClick={() => {}}` remains in any reachable component.
2. `grep -rln 'ui/QueueItem' src/` stays 0 and the file is gone.
3. Onboarding's OPML import registers real feeds through the existing command.
4. `import_from_youtube` inserts channels, dedupes by `external_id`, reports
   true counts, and is callable from the UI; a duplicate import imports 0.
5. A playlist can be created from the live queue, listed, and played back into
   the queue — with a real `playlists` table.
6. Editing a play-mode rule changes the mode used when the queue advances to a
   queued episode.
7. Settings > Smart Links renders the same real content as `/smart-links`.
8. Full gates green: vitest, cargo, `tsc`, e2e, `eslint`.

## 🔒 Authority matrix

| Operation | Status | Gate |
|---|---|---|
| Read-only inspection | allowed | — |
| Edit files on `master` | allowed (repo convention) | dirty-work preservation first |
| Add SQL to `sql/schema.sql` + a data-migration in `db/migrations.rs` | allowed | schema-only, `CREATE TABLE IF NOT EXISTS` |
| Commit on `master`, staged by path | allowed | gates green + staged diff reviewed |
| Push `master` | **requires separate owner permission** | not assumed by this plan |
| Tag / release / Homebrew / Pages | **prohibited** | owner-gated |
| Live network (iTunes, Invidious, yt-dlp) | allowed in *smoke* tests only, behind existing live-test gating | never in unit tests |

## 🛑 Phase 0 — forced preflight

**Three strategy sentences (required before any edit):**

1. Every fix lands behind a failing test first, in an order that puts pure
   Rust helpers and pure TS reducers before any UI wiring, so each phase's
   receipt is a unit-level assertion rather than a screenshot.
2. `import_from_youtube` and the playlist queries both funnel persistence
   through the existing `Database` pool API (`db/mod.rs:19`) so the new code
   reuses proven insert paths instead of hand-rolling SQL at the command
   layer.
3. The two Smart Links surfaces converge by extracting the existing
   `SmartLinksScreen` body into one shared component, so the Settings tab
   gains real behaviour without duplicating the implementation.

**Actions:** re-read this plan's facts against live source; run
`git status --porcelain` and record the dirty `node_modules/.package-lock.json`
before editing; confirm the test commands below actually exist; confirm
`sql/schema.sql` is the only schema surface and that no numbered-migration
directory exists.

**🧪 Receipt 0:** `git status --porcelain` output showing only the known
`.package-lock.json` modification; `wc -l` on the files to be touched; the
commands `npx vitest run`, `npx tsc --noEmit`, `cargo test`, `npx playwright
test`, `npx eslint .` each resolving without error.

## 🗑️ Phase 1 — delete the orphaned `ui/QueueItem.tsx`

**Objective:** remove dead code so a future session cannot "fix" a component
nothing renders.

**Tasks:** confirm zero importers one more time (including dynamic imports and
any `lazy(`), then delete `src/components/ui/QueueItem.tsx`. If it has a
dedicated test file, delete that too and confirm no other test imports it.
Do **not** touch `src/components/queue/QueueItem.tsx`.

**Tests:** `npx tsc --noEmit` (a stray import would fail the build);
`npx vitest run` unchanged at 212.

**Discriminant:** before deleting, prove the file is really unreferenced by
grep for its exported symbol `QueueItemProps` and `QueueItem` across `src/`
and `e2e/`; a hit anywhere stops this phase.

**🧪 Receipt 1:** grep count 0 for the symbol; tsc exit 0; vitest 212/212.

## 🔌 Phase 2 — wire Onboarding's OPML import

**Objective:** the onboarding import button calls the command Settings already
uses.

**Tasks:** in `src/components/screens/OnboardingScreen.tsx`, replace the dead
onClick on the "Import from OPML file" button with a handler that opens the
file through `@tauri-apps/plugin-dialog` (already a dependency) and calls
`channelCommands.import('opml', contents)`. Disable the button while pending,
show the imported-count toast, and keep the existing `handleNext()` on
"Skip for now".

**Tests:** RED first — a vitest case asserting the mock router's `import` is
called with the file's contents and that the success toast names the count.
Mirror `SettingsScreen.tsx:440-455`'s existing behaviour; the mock router
(`src/mocks/`) already rejects unknown feeds, so a mock harness exists.

**Discriminant:** point the handler at a file whose contents the mock router
rejects, and assert the error path surfaces rather than reporting success.

**🧪 Receipt 2:** new test red → green; full vitest unchanged elsewhere.

## 📺 Phase 3 — complete `import_from_youtube`

**Objective:** a working YouTube-subscription import behind a Tauri command.

**Tasks:**
- In `podcast/mod.rs`, finish `import_from_youtube`: build each `Channel` and
  insert it through `self.db.pool()` + `queries::insert_channel`, **deduping on
  `external_id == sub.author_id` first** (mirror `register_podcast_feed`'s
  existence check). Accumulate per-channel errors; count only real inserts.
- Replace the hardcoded `notifications_enabled: true` with the same convention
  the OPML path uses (check `register_podcast_feed`: it sets `0`), and record
  which convention was chosen and why in a comment.
- Route the HTTP call through `self.client` (the shared client) rather than
  `reqwest::get`, so the 30 s timeout and user agent apply.
- Add a testable pure seam (the `search_itunes_with` / `fetch_feed_with`
  pattern) so the parse+dedupe logic is testable offline.
- Register the command in `lib.rs`'s `generate_handler!` and add a
  `subscribeFromYoutube`/`importFromYoutube` binding in `useTauriCommands.ts`.
- Wire the onboarding button to it.

**Tests:** Rust unit tests for the dedupe decision and the count/error
accumulation against a temp-DB fixture; a live smoke behind the existing
live-test gating against an Invidious instance (skip if unreachable, and say
so). Vitest for the button wiring.

**Discriminant:** feed the same subscription list twice; the second call must
report `imported: 0` with the dupes counted, not `imported: N` again. Then
verify the reverse: an empty/`author_id`-colliding payload imports nothing.

**🧪 Receipt 3:** cargo tests for the new seam green; the double-import case
asserted; a live smoke either green or explicitly reported as skipped.

## 🎵 Phase 4 — playlists (new backend + UI)

**Objective:** "Save as playlist" stores the live queue under a name; playlists
can be replayed.

**Schema** (`sql/schema.sql`, `CREATE TABLE IF NOT EXISTS`):
- `playlists(id TEXT PK, user_id TEXT, name TEXT, created_at, updated_at)`
- `playlist_items(id TEXT PK, playlist_id TEXT REFERENCES playlists(id) ON
  DELETE CASCADE, episode_id TEXT, position INTEGER, added_at)`
- indexes on `playlist_items(playlist_id, position)`.

Add a bounded data migration in `db/migrations.rs` for existing installs
(existing tables already use `IF NOT EXISTS`; confirm the established pattern
and follow it).

**Commands** (new `commands/playlists.rs`):
`list_playlists`, `create_playlist(name)`, `rename_playlist`,
`delete_playlist`, `add_episode_to_playlist`, `remove_playlist_item`,
`save_queue_as_playlist(name)` (snapshot of the current queue in order),
`play_playlist(playlist_id)` (fills the queue in order and starts playback).

**TS:** a `playlistCommands` block in `useTauriCommands.ts`, `Playlist` /
`PlaylistItem` types, and a `PlaylistsScreen` + `/playlists` route + sidebar
nav item (`Sidebar.tsx` list, ordered after Queue).

**UI:**
- QueueScreen "Save as playlist" opens a small name prompt (reuse the existing
  modal pattern in `src/components/ui/`) then calls `save_queue_as_playlist`.
- `PlaylistsScreen` lists playlists; each row has Play, Rename, Delete, and a
  remove-item control, with loading/error/empty states matching 2c's
  discipline.

**Tests:** Rust unit tests for each query including the empty-name rejection,
the delete-cascade, and `save_queue_as_playlist` preserving order; vitest for
the prompt + list + play flow; an e2e spec `e2e/f08-playlists.spec.ts` covering
save → list → play.

**Discriminant:** save a queue of 3, delete one item from the playlist, replay,
and assert the queue now has 2 in the original order — an order-losing
implementation must fail this.

**🧪 Receipt 4:** new cargo tests green; vitest + the new e2e spec green;
schema applied on a fresh DB and on a copy of an existing DB.

## ⏯️ Phase 5 — D7 resolution at play time

**Objective:** play-mode rules apply when the queue advances, not only on
card-click.

**Tasks:** resolve `resolveDefaultPlayMode(episode, playModeRules, channels)`
at the point playback starts from the queue, reusing the same pure function.
Keep `queueItemFromEpisode`'s `play_mode: 'unified'` (owner decision 3).
The engine's per-play mode override is already the mechanism (`play(ep, mode)`
at `useEpisodePlay.ts:102`) — route queue-advance through it.

**Tests:** RED first — a test asserting that with a rule installed, advancing
the queue to a matching episode resolves the rule's mode; then the negative
(a non-matching episode falls through to the channel default, then to
undefined).

**Discriminant:** a canonical-but-non-discriminating rule fixture is not
enough — use two rules whose first match differs from the channel default, and
assert the *first* match wins (the 2026-10-19 lesson: canonical fixtures alone
left 8/8 mutations surviving).

**🧪 Receipt 5:** new tests red → green; mutation-checked by breaking the
match precedence and watching the test fail.

## 🔗 Phase 6 — converge the two Smart Links surfaces

**Objective:** Settings > Smart Links shows real content; one implementation.

**Tasks:** extract the body of `SmartLinksScreen.tsx` into a shared component
(e.g. `src/components/smartlinks/SmartLinksPanel.tsx`) used by both the route
and the Settings tab; remove the dead "Run Matching" button and the
`<EmptyState variant="feed" />` placeholder from the tab. Extend the existing
`smart-links-screen.test.tsx` to cover the Settings tab rendering the same
content.

**Tests:** a vitest case asserting the Settings tab renders the real panel
(link rows / confirm / unlink), not an empty state.

**Discriminant:** assert the Settings tab contains at least one element only
the real panel produces, then temporarily point the tab back at the
placeholder and confirm the test fails.

**🧪 Receipt 6:** Settings tab renders the panel; the placeholder assert fails
when reverted.

## 🧪 Phase 7 — regression, docs and delivery

**Tasks:** run every gate; update `CHANGELOG.md` (0.1.0 is unreleased — add to
the 0.1.0 section, do not invent a new version); update `README.md` for
playlists and YouTube import; correct the roadmap's stale gap list
(`2026-10-19-release-roadmap.md:336-341`) to name what was fixed and what
remains; record the new waypoints' resolution.

**Tests:** `npx vitest run`, `cargo test`, `npx tsc --noEmit`,
`npx eslint .`, `npx playwright test`. Run the full set, not samples.

**🧪 Receipt 7:** each command's tail output with pass counts and exit 0.

## 🧨 Adversarial review

| Tempting shortcut | False success | Harm | Rule | Detecting test |
|---|---|---|---|---|
| Wire onboarding OPML without reading the mock router's contract | Button "works" in the happy path | an OPML the router rejects reports imported feeds | Read `src/mocks/` first; assert the error path | Phase 2 discriminant |
| Let `import_from_youtube` insert without a dedupe check | Imports "succeed" | duplicates on every run; the UI reports a growing count for the same subscriptions | Dedupe on `external_id`, mirror `register_podcast_feed` | Phase 3 double-import test |
| Report `imported` from the loop counter (the current stub's shape) | Green tests, real failure | a count for work never performed — the exact defect being fixed | Count only after a successful insert | Phase 3 negative control |
| Add `playlists` to the schema but skip `migrations.rs` | Fresh installs work | existing installs never get the table; playlists silently do nothing | Add the data migration; test on a copy of a real DB | Phase 4 fresh-vs-existing receipt |
| Fix the D7 gap by hardcoding the mode at queue time instead | Test passes | rule edits made after queueing stop applying — contradicts owner decision 3 | Resolve at play time | Phase 5 test asserting a post-queue rule edit still applies |
| Make the Settings Smart Links tab a second copy of the panel | Tab looks real | two implementations drift; the 2c lesson (static stubs) repeats | Extract one shared component | Phase 6 placeholder-revert discriminant |
| `git add -A` at commit time | Commit looks complete | the unrelated `.package-lock.json` edit lands as part of this work | Stage by path; read `git diff --staged` | Phase 7 `git status --porcelain` review |
| "Green" from `npx eslint .` alone | Lint passes | no behaviour proven | Every phase's receipt names a test that exercises the behaviour | Phase 7 full-gate receipt |

## 🏁 Final review and delivery

Answer aloud before declaring done: what is implemented versus merely
planned; which receipts actually ran (name the command and its tail output);
were any tests skipped and why; was the pre-existing dirty file preserved and
excluded from commits; did the work stop before the push/tag boundary; was
this plan reread as an artifact after writing it.

Deliverable boundary: **commit on `master`, staged by path.** Push, tag,
release and Homebrew all wait for separate owner permission.
