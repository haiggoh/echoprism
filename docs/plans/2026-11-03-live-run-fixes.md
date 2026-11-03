# 2026-11-03 live-run fixes (owner run of bin/echoprism) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans (native, this session) task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fix the six defects the owner hit while running the app from the local repo on 2026-11-03, then ship them as v0.1.4 (tag + GitHub release + Homebrew cask update).

**Architecture:** Four backend fixes in `src-tauri` (instance backfill, failover log spam, matcher branding-suffix pattern, yt-dlp-fallback logging) and three frontend fixes in `src/` (app icon, audio-stage art size, vertical volume bar), each with a failing test first. No new dependencies.

**Tech Stack:** Rust (tauri 2, sqlx 0.7, tokio), TypeScript/React (vite, vitest + Testing Library), Tailwind.

**Spec:** owner report 2026-11-03 ~18:10–18:47 CET (session transcript) + live-run log. Root causes verified this session: live DB has ONLY `default-pipedapi-ducks-party`; `pipedapi.ducks.party` does not answer from this network within 12 s (curl `000`) while `api.piped.private.coffee` answers `200` in 1.2 s with the `"items"` marker; `seed_default_instances_if_empty` never backfills the second default on existing installs.

## Global constraints

- Stage by path only — the working tree has a pre-existing `M node_modules/.package-lock.json` that must NOT be committed.
- Work on a feature branch (`fix/2026-11-03-live-run`); ship via `rtc-ship` which merges to `master` (repo convention; v0.1.3 shipped this way).
- Version surfaces per `rtc-ship.json`: `package.json`, `src-tauri/tauri.conf.json`, `CHANGELOG.md` — bump all to 0.1.4.
- Every new/changed behavior gets a failing test first; run it red, then green (mutation discipline).
- Existing tests that encode a now-reversed owner decision get updated with the reversal recorded in a comment — never silently weakened.
- No `--help`-bearing scripts are touched; no published history is rewritten.

## Review focus (inputs most likely to bite)

1. An install whose instances table is non-empty but missing a default → backfill must add only missing URLs, never touch user rows (Task 1 test).
2. Failover warning must not repeat every 5 min for the same still-failed instance, but MUST log again if it recovers and fails anew (Task 2 test).
3. Branding-suffix strip must NOT fire when the removed segment is real content ("… | A Bonus Segment") or when either side collapses to one word (Task 6 tests).
4. Audio-stage art: video episodes get the full-width 16:9 thumbnail; a square podcast cover must still render (object-cover crops) — both asserted (Task 4 test).
5. Volume popup must stay clear of the seek strip (bottom-full of the controls row, compact vertical track) and remain keyboard-operable via the range input (Task 5 test asserts orientation classes + aria-label).

---

### Task 1: Backfill missing default Piped instances on existing installs

**Files:**
- Modify: `src-tauri/src/db/queries.rs` (near `seed_default_instances_if_empty`, line ~85)
- Modify: `src-tauri/src/lib.rs:128` (startup call site)
- Test: `src-tauri/src/db/queries.rs` (tests module near line 3541)

**Interfaces:**
- Produces: `pub async fn backfill_missing_default_instances(pool: &SqlitePool) -> DbResult<usize>` — inserts an `Instance` (same construction as the seed fn: id `default-<host-slug>`, `InstanceType::Piped`, `Unknown`, `auto_failover: true`) for each `DEFAULT_INSTANCES` URL not already present (match by `url`); returns rows inserted. Never updates or deletes existing rows.
- `lib.rs` calls it right after `seed_default_instances_if_empty` and logs the count at info.

- [ ] Step 1: failing test — fresh in-memory pool (migrations only), insert one custom instance row, call `backfill_missing_default_instances`, assert both DEFAULT_INSTANCES urls present + custom row untouched + returns 2 on empty table / 0 when all present (idempotent second call).
- [ ] Step 2: run `cargo test -p echoprism backfill -- --nocapture` → red.
- [ ] Step 3: implement the fn + call site.
- [ ] Step 4: same command → green; `cargo test -p echoprism seed_default` still green (existing seed-if-empty tests at 3541–3572 unchanged).

### Task 2: Stop the every-5-min ERROR failover spam; fail over the same cycle

**Files:**
- Modify: `src-tauri/src/background_tasks/mod.rs` (`run_instance_health_checks`, lines 40–65)
- Modify: `src-tauri/src/instance_pool/mod.rs` (`failover_instance`, lines 137–154)
- Test: `src-tauri/src/background_tasks/mod.rs` tests (new small pure helper) + `instance_pool` tests

**Interfaces:**
- Produces: `failover_instance` keeps its signature but the loop logs a no-candidate failure at `warn!` ONCE per instance until its health becomes Healthy again. Extract the dedupe as a pure testable helper, e.g. `struct FailoverLog { reported: HashSet<String> }` with `fn should_log(&mut self, id: &str, healthy: bool) -> bool` (healthy → remove from set and return false; failed & already in set → false; failed & new → insert, true).
- Loop change: after `test_instance`, re-read the instance (`pool.get`) so the failover decision uses the FRESH health (currently the stale pre-test snapshot delays failover one 5-min cycle).

- [ ] Step 1: failing unit tests for `should_log` (first failure logs, repeat doesn't, recovery resets).
- [ ] Step 2: run → red.
- [ ] Step 3: implement helper + loop rewiring.
- [ ] Step 4: run → green; full `cargo test -p echoprism background_tasks` green.

### Task 3: App icon must not swap to headphones in audio-only mode

**Files:**
- Modify: `src/components/ui/PrismAppIcon.tsx` (remove `audioOnly` prop, the `HeadphonesIcon` branch, `PRISM_PALE_*` imports)
- Modify: `src/components/Sidebar.tsx:49` (drop `audioOnly={isAudioMode}`)
- Test: `src/__tests__/app-icon-sync.test.tsx` (third test, lines 65–81, currently encodes the reversed 2026-11-02 decision)

**Interfaces:**
- `PrismAppIconProps` loses `audioOnly`; the component always renders the prism mark. The headphones mark stays ONLY on the player stage (`PlayerScreen` `audio-stage-headphones`, where cover art would be) — which is where the owner wants it.
- Grep first: any other `PrismAppIcon ... audioOnly` call sites and `PrismConvergeToggle` (Header) — the toggle keeps its own audio indication; only the app icon changes.

- [ ] Step 1: rewrite the third app-icon test: `render(<PrismAppIcon size={64} />)` twice is identical; assert `queryByTestId('headphones-mark')` is null in the Sidebar render even when audio mode is on (drive via store if cheap, else assert the Sidebar passes no audioOnly by rendering and checking no headphones-mark). Record in the comment: owner correction 2026-11-03 — headphones on the app icon was a mistake; the mark belongs on the player stage.
- [ ] Step 2: `npx vitest run src/__tests__/app-icon-sync.test.tsx` → red.
- [ ] Step 3: implement (remove prop/branch; update Sidebar).
- [ ] Step 4: same command → green; dock-icon sync test (first test) still green since default render is unchanged.

### Task 4: Audio-only stage shows the full-sized thumbnail, not a small square

**Files:**
- Modify: `src/components/screens/PlayerScreen.tsx:113` (`w-40 h-40` → full stage width)
- Test: `src/__tests__/audio-stage-art.test.tsx`

**Interfaces:**
- Stage art class becomes `w-full max-w-2xl aspect-video object-cover rounded-2xl` (YouTube thumbs are 16:9; square podcast art crops via object-cover). Headphones fallback (no art) unchanged.

- [ ] Step 1: extend the existing art tests: the stage `img` for a VIDEO episode carries `w-full`/`aspect-video` (assert via `className` contains), podcast-art episode still renders its img.
- [ ] Step 2: `npx vitest run src/__tests__/audio-stage-art.test.tsx` → red.
- [ ] Step 3: one-line className change.
- [ ] Step 4: → green.

### Task 5: Volume bar vertical, clear of the play bar

**Files:**
- Modify: `src/components/MiniPlayer.tsx:268-282` (the hover popup + range input)
- Test: `src/__tests__/` — add assertions to the existing mini-player/volume test if one exists (grep `Volume` in `src/__tests__` first), else a new small `mini-player-volume.test.tsx`

**Interfaces:**
- Popup: `absolute bottom-full right-0 mb-2 h-28 w-10 flex items-center justify-center` (above the controls row, never over the seek strip which sits at the bar's top edge); input keeps `type="range"`, `aria-label="Volume"`, and becomes vertical via `[-webkit-appearance:slider-vertical]` (WKWebView native) with `h-24 w-6 accent-accent bg-surface rounded-full` fallback styling; min/max/step/value/onChange unchanged.

- [ ] Step 1: failing test — hovering the mute group reveals a slider whose class list contains `slider-vertical` (or the arbitrary property) and whose container has `bottom-full`; seek strip (`role="slider"` aria-label "Seek") is a different element.
- [ ] Step 2: `npx vitest run <file>` → red.
- [ ] Step 3: implement markup.
- [ ] Step 4: → green; full vitest suite green.

### Task 6: Matcher — a divider + branding suffix must score 1.0 ("X" vs "X | The Vergecast")

**Files:**
- Modify: `src-tauri/src/matcher/mod.rs` (`title_similarity_for_pairing` ~line 215 and a new helper near `strip_show_branding` ~line 190)
- Test: `src-tauri/src/matcher/mod.rs` scorer tests

**Interfaces:**
- New helper on `Scorer`: `fn segment_variants(&self, title: &str) -> Vec<Vec<String>>` — content words of the full title, plus content words with the LAST divider-segment removed, plus with the FIRST removed (split on `| - – — :`; only when ≥2 segments and the remainder keeps ≥1 content word). Divider-delimited, unlike `content_words` which splits on every non-alphanumeric.
- `title_similarity_for_pairing` returns 1.0 when any variant of title1 equals any variant of title2 exactly (both sides ≥2 distinct words — the existing one-word guard still caps such pairs at 0.5 via `similarity_of`, so check the guard before declaring 1.0). Otherwise falls back to the existing channel-name strip + `similarity_of`.
- This implements the handover pattern rule (`docs/plans/2026-10-28-live-test-batch-2.md` Task 4 owner quote): recognize the "same title + show branding" pattern, not only exact channel-name matches.

- [ ] Step 1: failing tests — owner's exact pair ("Amazon built the Trojan Horse for your smart home" vs "… | The Vergecast", channels "The Verge"/"The Vergecast" AND channels None) → `title_similarity_for_pairing(...) == 1.0`; "X | A Bonus Segment" vs "Y" stays < 1.0; one-word title pair stays ≤ 0.5.
- [ ] Step 2: `cargo test -p echoprism matcher` → red.
- [ ] Step 3: implement.
- [ ] Step 4: → green; all nine calibration tests + existing branding tests still green.

### Task 7: Log the silent yt-dlp stream fallback (handover item 3 half)

**Files:**
- Modify: `src-tauri/src/extractor/mod.rs` `resolve_stream` (line 119–126): `tracing::warn!` when `candidates` is empty and when falling through to yt-dlp after all candidates failed, naming the video_id and candidate count.
- Test: log assertion is impractical — instead assert behavior unchanged (existing extractor tests cover resolve paths); this task is log-only.

### Task 8: Verify + ship v0.1.4

- [ ] `cargo test -p echoprism` (full) and `npx vitest run` (full) green.
- [ ] Bump 0.1.3 → 0.1.4 in `package.json`, `src-tauri/tauri.conf.json`, `CHANGELOG.md` (new entry naming all fixes + why).
- [ ] Commit by path on `fix/2026-11-03-live-run`; ship with `rtc-ship` (merge to master, tag v0.1.4, release with dmg; verify tag visibility via `git ls-remote` after a short delay).
- [ ] Update Homebrew cask `Casks/echoprism.rb` in `haiggoh/homebrew-tap` with the new dmg sha256 + version (use `gh api` for the release asset, not raw.githubusercontent), push; verify via `gh api repos/haiggoh/homebrew-tap/contents/Casks/echoprism.rb`.
- [ ] Update waypoints `echoprism-release-roadmap` with the 2026-11-03 v0.1.4 point (remaining owner-gated: Pages enable, Phase I click-through).
- [ ] Do NOT touch GitHub Pages (owner-gated, explicitly deferred by the owner).
