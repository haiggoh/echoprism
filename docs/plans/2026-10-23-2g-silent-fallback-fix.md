# Execution Plan — 2g: the instance tier stops being silently skipped (handoff item 3)

_Authoring date: 2026-10-23 (GLM 5.3 Flash free session). Parent:
`docs/plans/2026-10-22-handoff-glm-flash.md` item 3. Standing rules and
authority matrix as 2e/2f (master-only, staged by path, nothing
pushed/tagged/published, TDD + cmp-guarded mutations, Gemini review)._

## Verified diagnosis (2026-10-23, live network — the "check" the handoff asked for)

1. **pipedapi.ducks.party is UP and its search works**: `GET /search?q=vergecast&filter=videos`
   → HTTP 200 in 1.5 s with real results. The instance is NOT down.
2. **The health probe is wrong for Piped.** `check_instance_health`
   (`instance_pool/mod.rs:92`) probes `{url}/api/v1/videos/test` — the
   INVIDIOUS path — for both types. On the Piped default it 404s (live-checked)
   → `InstanceHealth::Failed` → `order_for_search` (line 175) filters Failed
   out → search goes straight to yt-dlp with no log line. The health task's
   every-5-minutes `Failover failed ... No healthy instance available` ERROR is
   the same root cause (the pool's only instance is never Healthy).
   Same bug class as 1e's stream-resolver fix (`24f8d5c5`), one layer up.
3. `search_with_instance` already speaks Piped correctly (`/search?q&filter`),
   so fixing the probe reconnects the whole tier.
4. Candidate second defaults, live-checked now: kavin.rocks 502, adminforge.de
   301, drgns.space dead — **`api.piped.private.coffee` → 200, 17 KB, response
   shape identical to the committed 1b fixture** (`items` key, same item keys).
   It becomes the second `DEFAULT_INSTANCES` entry.

## Design decisions (recorded per owner rule 1)

1. **Fix the probe, don't just log.** The handoff says "check whether pipedapi
   is down or our health probe is wrong" — the check answered "the probe", and
   the handoff's own "seed more than one default instance" depends on it: a
   second Piped default probed with the Invidious path would be marked Failed
   too. Fixing the probe is the load-bearing half of the item.
2. **Probe the capability we need.** Piped health = its `/search?q=test&filter=videos`
   answering 200 (search is what the tier is for). The old body-sniff
   ("Invidious"/"Piped" branding) mislabeled real JSON responses Degraded;
   Piped's marker becomes the `"items"` JSON key. Invidious probing is
   UNCHANGED (user-added/self-hosted tier; public Invidious API is disabled
   ecosystem-wide per 1b — not this milestone's problem).
3. **Seed-if-empty semantics unchanged.** Existing installs keep exactly their
   configured set (documented behaviour), so the owner's install heals via the
   probe fix; the second default lands on fresh installs. Reported, not
   silently changed.
4. **The silent branches get log lines, not unit tests.** `search_episodes`
   gains: a WARN when `order_for_search` yields no candidates, an INFO when an
   instance answers with zero hits, and an INFO before the yt-dlp fallback.
   No tracing-capture harness exists in this repo; these are observability
   lines verified by review. The BEHAVIOUR fixes (probe, seed) get TDD.

## Phases

1. **Probe seam (TDD).** Extract pure fns into `instance_pool/mod.rs`:
   `health_probe(instance) -> (url, params)` (Piped → `{url}/search` +
   `q=test&filter=videos`; Invidious → `{url}/api/v1/videos/test`, no params)
   and `classify_health(request_success, body_marker) -> InstanceHealth`
   (Healthy/Degraded/Failed), plus a per-type body-marker fn (Piped:
   contains `"items"`; Invidious: contains `Invidious` or `Piped` — existing
   rule). `check_instance_health` composes them; classification rule
   unchanged for Invidious. Tests: probe request per type; classify table;
   marker against the COMMITTED live fixture (`extractor/fixtures/
   piped_search.json`) and a negative (HTML body).
2. **Seed (TDD).** `DEFAULT_INSTANCES` gains
   `https://api.piped.private.coffee` (live-verified above). The seed test's
   expected count derives from `DEFAULT_INSTANCES.len()` (derive, don't
   duplicate); id slugs checked for both.
3. **Logging.** The three lines from decision 4.
4. **Live smoke (new, #[ignore])** — GET `health_probe(...).0` for the seeded
   Piped default and assert HTTP 200: the direct regression test for the root
   cause (the old probe URL 404s). Run with the other live smokes.
5. **Gates + review + records.** cargo (parallel), tsc (project binary),
   vitest, Playwright, `cargo test --lib -- --ignored`; Gemini dispatch;
   receipts here; roadmap updated.

## Mutations (planned)

- Revert the Piped probe URL to `/api/v1/videos/test` → the probe test red.
- Make `classify_health` return Failed for (true, true) → the classify test
  red. Restores cmp-verified, green re-collected after.

## Non-goals

Auto-failover persistence (the `TODO: Update DB` in `failover`), adding
defaults to NON-empty installs, Invidious probing changes, SABR/age-gate
flags.

## Receipts (2026-10-23, GLM 5.3 Flash free session — nothing pushed)

- **Diagnosis DONE before code** — the handoff's fork answered: the instance is
  UP (probe + search 200), the PROBE was wrong (Invidious path on Piped → 404
  → Failed → silently skipped). Second default candidates live-checked; only
  `api.piped.private.coffee` passed (200, shape == committed fixture).
- **Phase 1 DONE** (probe seam, `cbcd38b8`) — RED 1: E0425 (fns missing). One
  type error in the new code caught by the compiler (tuple's first element as
  String vs &str) before any green claim. GREEN 71/71 incl. 4 new tests:
  probe request per type, the classify table, and the Piped marker against
  the COMMITTED 1b live fixture (captured-then-coded). Mutation: Piped probe
  reverted to the Invidious path → red; restore cmp-verified; green after.
- **Phase 2 DONE** (seed, same commit) — test updated FIRST to derive its
  expected count from `DEFAULT_INSTANCES.len()` → RED (1 ≠ 2) → const gains
  the live-verified host → GREEN. Seed-if-empty semantics unchanged (the
  existing-instances test still passes).
- **Phase 3 DONE** (logging, same commit) — WARN on zero candidates, INFO on
  an instance answering zero hits, INFO before the yt-dlp fallback. Not unit
  tested (no tracing harness; observability lines — decision 4).
- **Phase 4 DONE** (live smoke, same commit) — new `#[ignore]`
  `live_piped_probe_url_answers_200`: GETs the probe URL for the seeded
  default and asserts 200 + marker. Live run 6/6 (was 5/5) — the direct
  regression test for the root cause, green against the real host.
- **Phase 5 DONE** — gates: cargo 71/71 + 6 live smokes, tsc clean, vitest
  160/160, Playwright 25/25. Gemini review of the 304-line diff: **NO
  FINDINGS**; own triage (Invidious drift, health-loop side effects, seed
  semantics) — nothing survives. Roadmap updated.
