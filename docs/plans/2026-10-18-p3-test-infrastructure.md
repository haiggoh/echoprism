# P3 Execution Plan — Test Infrastructure & Verification (2026-10-18)

🚨 **System instructions for the AI developer — read first**
- Self-contained: no chat transcript needed. Revalidate live source before mutating.
- Output three strategy sentences before file edits, then do read-only preflight.
- Native Read/Edit/Write for files; Bash for git/tests/executables. Never `git add -A`.
- A phase is done only with an actual receipt (command + exit status + observation).
- Failure → STOP the phase, diagnose, fix, rerun the same test. Never weaken an
  assertion to go green; suspect the instrument first.

## Context and objectives

**Project:** EchoPrism — free, open-source alternative client to YouTube + RSS
podcast feeds. Tauri v2 (Rust backend, `src-tauri/`) + React/TS frontend (`src/`).
Local repo `~/ClaudeWorkspace/echoprism`, branch `master`, **no remote** (local-only).

**Confirmed live facts (2026-10-18):**
- Media engine LANDED: `cd454112` (hidden `<audio>` + PlayerScreen `<video>` wired
  to `stream_episode`, D3 position sync, auto-advance) and `ea36f9e6` (SQL repair,
  idempotent migrations, D2 backend column). Verified: cargo check exit 0, build
  535 modules exit 0, vitest 5/5.
- `src/hooks/useTauriCommands.ts` is the single choke point: every command wraps
  `invoke` from `@tauri-apps/api/core`. No mock layer exists; no `__TAURI_INTERNALS__`
  guards anywhere in `src/`.
- `package.json` has **no** `db:seed` and **no** e2e script; Playwright/axe not
  installed. vitest config lives in `vite.config.ts` (include scope `src/**/*.{test,spec}.*`).
- Design decisions D1–D4 in `design-decisions.md` are binding (stream-on-demand,
  card-click preference, position sync, local-first).
- Repo hygiene known issue (out of scope, reported to owner): node_modules (17,437
  files) is tracked in git; `M node_modules/.package-lock.json` stays uncommitted.

**Current → required behavior:**
- Plain `npm run dev` (browser, no Tauri shell): currently every `invoke()` fails →
  app shows empty/error states. **Required:** a dev-only mock IPC layer serves
  fixture data when `window.__TAURI_INTERNALS__` is absent, so flows F01–F05 are
  exercisable headlessly (Playwright) and in a plain browser.
- Just-committed PlayerProvider engine: **no tests**. Required: vitest coverage for
  stream resolution, D3 position restore on src change, ended→auto-advance,
  error→toast+pause.
- `replica/test-plan.md` (113 cases, F01–F12) has no runnable harness. Required:
  Playwright + @axe-core/playwright scaffold, happy-path + key edge specs for the
  mock-testable flows, `db:seed` for real-backend runs.
- True invoke round-trips still need `npm run tauri:dev` (GUI) — final handover
  phase, not automatable headlessly.

**Hard constraints / non-goals:**
- D1: queue-add never downloads; D2: card-click preference semantics per
  design-decisions.md. Do not alter command contracts (contract test guards them).
- No new runtime dependencies; dev-only deps allowed (@playwright/test,
  @axe-core/playwright), pinned by package-lock.
- Mock layer must be INERT inside the Tauri shell (guard on `__TAURI_INTERNALS__`).
- Do not touch node_modules tracking; do not fix the 17k-file hygiene issue here.

**Authority matrix (owner directive 2026-10-18: full auto, commit at milestones):**

| Operation | Status |
|---|---|
| Read-only inspection | allowed now |
| Edit src/, scripts/, package.json (devDeps) | allowed now |
| Install project-scoped devDeps (playwright, axe) | allowed now (test-plan.md documents it) |
| npx playwright install chromium (~150MB download) | allowed now (documented requirement) |
| Run vitest / build / cargo check / Playwright | allowed now |
| Commit to local master (staged by path, GLM 5.3 trailer) | allowed now |
| Push / tag / release | **prohibited — no remote exists; not authorized** |
| `npm run tauri:dev` GUI launch | allowed (final phase; leaves a window for the owner) |
| Deletion of data / live services | prohibited |

## Phases

### Phase 0 — preflight (done 2026-10-18)
Receipt: verification log `/tmp/echoprism-verify.log` — cargo 0, build 0, vitest 5/5;
tree clean except `M node_modules/.package-lock.json`; HEAD `cd454112`.

### Phase 1 — PlayerProvider engine tests (vitest, TDD)
**Objective:** the just-committed engine gets behavioral coverage (a feature with no
test is not done).
**Tasks:** jsdom setup; stub `HTMLMediaElement.play/pause` (jsdom lacks them); mock
`episodeCommands.stream` and the toast store. Cases: play() resolves stream and sets
src on the active element; D3 — position restored from playbackState on src change;
ended → nextTrack called; stream rejection → isPlaying false + toast; volume/rate
sync across both elements.
**Tests:** `npx vitest run src/__tests__` — expect prior 5 + new, all green.
**Discriminant:** temporarily break position-restore in PlayerProvider → the D3 test
must fail; restore → green (run in a scratch copy, reverted immediately).
**🧪 Receipt 1:** vitest output with test count and exit status.
**Status: DONE 2026-10-18** — commit ea831e3f (`src/__tests__/player-engine.test.tsx`,
9 behavioral tests; engine `load()` + unified resolve effect; RED proven by TS
failure then TypeError, mutation discriminant applied on the guarded line).

### Phase 2 — dev-mode mock IPC layer
**Objective:** `npm run dev` in a plain browser serves fixture data; flows testable
without the Tauri shell.
**Tasks:** `src/mocks/data.ts` (2 channels, 4 episodes — 2 video, 2 podcast, one
with progress_seconds>0, realistic titles; preferences matching D1/D2 defaults);
`src/mocks/router.ts` (command name → handler for: get_feed, get_episode,
search_episodes, stream_episode, get_settings, update_settings, list_channels,
get_queue + queue mutations, list_instances, list_smart_links, list_history);
`src/tauri-bridge.ts` exporting `invoke` that delegates to the mock router when
`window.__TAURI_INTERNALS__` is absent, real invoke otherwise; useTauriCommands
imports from the bridge (single-line change).
**Tests (TDD):** router unit tests first (unknown command → rejects; stream_episode
returns {url, format}; update_settings persists in-memory). Then bridge test:
mock path chosen without Tauri globals, real invoke path untouched (vi.mock the
@tauri-apps/api/core module and assert delegation when the global is present).
**Discriminant:** a fixture episode removed from data.ts → the feed test asserts
fewer cards; restored → original count.
**🧪 Receipt 2:** vitest run output; manual curl of `npm run dev` + note that feed
renders (via Playwright in Phase 4 — receipt deferred there, honestly labelled).
**Status: DONE 2026-10-18** — commit c93222e9 (`src/tauri-bridge.ts`,
`src/mocks/{data,router}.ts`, bridge + router + contract tests, single choke
point rewire of useTauriCommands).

### Phase 3 — db:seed script
**Objective:** `npm run db:seed` populates the dev SQLite DB so `tauri:dev` runs
against realistic data.
**Tasks:** locate the DB path from `src-tauri` config (discovery step, do not guess);
`scripts/seed.sql` (INSERT OR IGNORE, same entities as the mock fixtures);
`npm run db:seed` = node script applying seed.sql via the `sqlite3` CLI (already a
verified dependency — migration test uses it).
**Tests:** run against a TEMP db copy, assert row counts (episodes=4, channels=2,
preferences=1); never touch a live DB in tests.
**Discriminant:** seed.sql with a deliberately invalid statement fails the script
non-zero in a scratch copy; repaired passes.
**🧪 Receipt 3:** script stdout + row counts from the temp DB.
**Status: DONE 2026-10-18** — `scripts/seed.mjs` + `scripts/seed.sql` + `db:seed`
npm script; 4 script-contract tests (temp DBs only, never the live DB); suite
27/27, build exit 0. Preference row inserts only `user_id` — D1/D2 values come
from the schema DEFAULTs, so the test pins the schema itself.

### Phase 4 — Playwright + axe scaffold and first specs
**Objective:** runnable e2e harness executing the headless-testable subset of the
113-case plan.
**Tasks:** `npm i -D @playwright/test @axe-core/playwright`; `npx playwright
install chromium`; `playwright.config.ts` (webServer `npm run dev`, port 1420,
reuse-existing-server off in CI mode); `e2e/` specs: F01-H1 onboarding (4 steps →
feed empty state), F02-H1 search→channel (mock), F05-H1 queue add/reorder/remove,
F03/F04 happy path via mock stream (tiny data: URL), axe scan on feed/settings/
player screens. Map each spec to its test-plan case ID in a comment.
**Tests:** `npx playwright test` — expected: all green, axe violations = 0 on
scanned screens (record actual count honestly; violations → fix or file as
test-plan deviation, never silence).
**Discriminant:** an intentional wrong locator (planted, then reverted) fails its
spec; correct locator passes.
**🧪 Receipt 4:** playwright summary (passed counts per spec) + axe results.
**Honest scope note:** this covers happy paths + selected edges of F01/F02/F05 and
mocked F03/F04 — a subset of 113, explicitly recorded, extensible per case ID.

### Phase 5 — tauri:dev handover + final regression
**Objective:** real invoke round-trip verification prepared; repo left consistent.
**Tasks:** run full regression (cargo check, build, vitest, playwright); commit
remaining work in coherent units (staged by path, trailer: Claude Opus 5.5 line +
`Co-Authored-By: GLM 5.3 <noreply@z.ai>`); launch `npm run tauri:dev` for the owner
with a click-through checklist (feed shows seeded episodes; click video card →
video plays; card with media playing → queues (D2 auto); audio/video toggle keeps
position (D3/F06)); update waypoint + design-decisions if new decisions emerged.
**🧪 Receipt 5:** regression outputs + commit hashes; tauri:dev reported as
"launched for owner verification — invoke round-trips remain owner-verified", never
as "verified".

## Adversarial review (tempting shortcut → harm → rule)

1. **Testing only via mocks and calling runtime verified** → green suite proves
   nothing about real invoke → Phase 5 keeps that verification explicitly
   owner-gated and the report says so.
2. **Mock layer activating inside Tauri** (guard inverted or absent) → real backend
   silently bypassed → bridge test asserts delegation when `__TAURI_INTERNALS__`
   present; contract test still guards command names.
3. **Seeding the live dev DB in tests** → destroys owner state → Phase 3 tests use
   temp copies only.
4. **`git add -A` sweeping node_modules noise** → 17k-file commit → staged by path
   only; `git status --porcelain` read before every commit.
5. **Chromium download assumed installed** → Playwright fails confusingly →
   `npx playwright install chromium` receipt included, version pinned by lockfile.
6. **Axe failures silenced** → false accessibility pass → violations recorded and
   fixed or filed; never `--exit-zero`-style suppression.

## Final review questions
Implemented vs planned stated per phase with receipts; tauri:dev invoke
verification reported as owner-pending; no secrets in receipts; no live data
touched; work stopped before the push/tag boundary (no remote exists).
