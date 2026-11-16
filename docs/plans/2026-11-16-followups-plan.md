# v0.1.20 follow-ups — WebKit HLS e2e, cold audio ≤ 5 s, cleanup — Plan + Handoff

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (NATIVE: implement
> every task yourself, then one final whole-branch review). Entry point: `run-to-completion:autopilot`
> with this file as the queue. Checkbox (`- [ ]`) steps.

**Goal:** close the three open follow-ups from v0.1.20 and ship them as the next patch release.
**Spec / background:** `docs/plans/2026-11-15-streaming-startup-design.md` (design),
`docs/plans/2026-11-15-streaming-startup-plan.md` (previous plan — its standing rules, Phase 0
style, receipts and adversarial review all still apply), `docs/plans/2026-11-15-cold-path-findings.md`
(measurements), `docs/plans/2026-11-15-streaming-startup-handoff.md` §6 (what v0.1.20 delivered).

## 🚨 System instructions for the executor — read first
1. This document is self-contained; you have no prior chat. Revalidate every path and claim
   below against live source before any mutation (they were true at `a7bcdef3`).
2. Output exactly three strategy sentences before the first file edit, then run Phase 0
   read-only and record Receipt 0.
3. Prefer native Read/Grep/Glob/Edit tools; use the shell for git, tests and execution. Never
   guess a tool schema, rewrite a file from fragments, or ship placeholder code.
4. Respect the authority matrix below. Clearance for one boundary never implies the next.
5. Every task ends with a receipt (command, real trimmed output, `EXIT:` code, invariant). A
   failure = STOP → diagnose (superpowers:systematic-debugging) → fix → rerun, show both runs.
   "Not tested" is written as such.
6. No secrets, process argv or tokens in logs or receipts.

## 🔒 Authority matrix (highest granted boundary: SHIP THROUGH RELEASE — owner, 2026-11-16)

| Operation | Status | Gate / evidence |
|---|---|---|
| Read-only inspection; `curl -4` / `yt-dlp --force-ipv4` probes of public URLs | allowed now | ≤ 30 yt-dlp runs/hour |
| Create worktree `~/.wt/ep-followups`, edit, local commits on `feat/v0120-followups` | allowed now | Receipt 0 |
| Add `libloading` (Rust) or any npm/crate dependency | allowed after gate | pinned version, named in the task receipt |
| Generate + commit e2e media fixtures with ffmpeg | allowed now | < 300 KB total, README with commands |
| Build the persistent extractor helper | allowed after gate | ONLY if Task 2 measurement shows audio-only HLS misses ≤ 5 s cold |
| Spawn/kill the helper process the app itself starts (in tests: fake helper) | allowed now | tests kill what they start; never other processes |
| Launch the app binary for a live check / dogfood | allowed now | your own build; quit it afterwards |
| Push branch, merge to master, bump, tag, GitHub release, refresh | allowed after gate | Task 4 gates green, via `rtc-ship.sh` on the WORKTREE |
| Force-push, move/delete a published tag, rewrite master | **prohibited** | fix forward |
| Edit/reset/switch the canonical checkout `~/ClaudeWorkspace/echoprism` | **prohibited** | except the final `pull --ff-only` when clean on master |
| Write `~/Library/Application Support/app.echoprism/*` | **prohibited** | `sqlite3 -readonly` only |
| Kill pid 59875, anything on ports 4141–4151, `remote-session.sh --stop` | **prohibited** | — |
| Anything not listed | needs owner | add a waypoint, continue with the rest |

## ⚠️ Side-effect classification
- **Network (YouTube):** Task 2 measurements and live tests → IPv4, rate-capped, no login/cookies.
- **Process control:** the persistent helper (Task 2, conditional) → its own tests use a FAKE
  helper script in a temp dir; the real helper is exercised only by ignored live tests.
- **Disk writes:** fixtures under `e2e/fixtures/hls/` only; scratch scripts and probe output in
  `mktemp -d` dirs outside the repo.
- **App launch:** Task 3 live check copies the debug binary to a `mktemp -d` dir; quit it after.
- **Publishing:** Task 4 only, through `rtc-ship.sh`. Its `--help`/dry-run behaviour was not
  re-checked by the planning session: read its argument handling before relying on any dry run.

## 1. Why this exists
v0.1.20 shipped the startup work (`v0.1.20` → `4128c27b`, release published 2026-11-16 00:14 UTC).
Three follow-ups stayed open; the owner asked (2026-11-16) to address them all, after installing
Playwright WebKit so HLS can be tested end-to-end.

## 2. Goal (owner, verbatim, 2026-11-16)
> "I installed playwright webkit just now so we can integrate hls which wasn't supported yet.
> please also address the rest of the open followups"
> (and, on the gap:) "yes e2e and chromium, that's what it said"

Owner decisions this round: execute via a **FRESH** free session + autopilot (owner: "let's not
reuse the old successor we should launch a fresh session" — the v0.1.20 executor, pid 59875,
gets no part of this work); **ship through RELEASE**; the
**persistent extractor process MAY be built** if audio-only HLS alone does not get cold audio
≤ 5 s.

## 3. State (verified by the planning session, 2026-11-16 ~10:40 UTC)
- `origin/master` = `4128c27b` (= tag `v0.1.20`). Local canonical `master` is **1 ahead**:
  `2f931976 docs(plans): handoff receipt — v0.1.20 shipped` (unpushed docs). This plan's commit
  adds one more. The ship pushes them; do not drop them.
- **Another live session works in the canonical checkout** (the owner talks to the v0.1.20
  executor, pid 59875). It may commit to canonical `master` at any time. NEVER edit, reset or
  switch that checkout; fetch + rebase your branch on the latest local AND remote master right
  before shipping.
- *confirmed live 2026-11-16:* Playwright 1.64.1 with `webkit-2370` installed; WebKit plays
  native HLS — `canPlayType('application/vnd.apple.mpegurl') === "maybe"`, an ffmpeg HLS VOD
  (320×180, 2 s segments, `application/vnd.apple.mpegurl` + `video/mp2t`) reached `playing`,
  `videoWidth 320`. Probe script: `/tmp/ep-wk/probe.cjs` (may be gone; recreate if needed).
- *confirmed in source:* `playwright.config.ts:33` → `projects: [{ name: 'chromium', … }]` only.
- `ffmpeg` at `/opt/homebrew/bin/ffmpeg`.
- Open waypoints this round closes: `echoprism-cold-start-still-5`, `echoprism-v0-1-20-follow-ups`.
  (`echoprism-audio-only-checkbox` is WATCH only — do not touch.)

## 4. Standing rules (adopt for the whole session)
1. Autonomous: decide and record; stop only for forks that cannot be weighed.
2. Work ONLY in worktree `~/.wt/ep-followups` (branch `feat/v0120-followups`, created from local
   `master`). NEVER switch/reset/edit `~/ClaudeWorkspace/echoprism` (live session + dev launcher).
3. Commit each milestone staged BY PATH, with the running model's trailer from memory
   `commit-attribution-by-model` (read it before every commit).
4. **Authority: through RELEASE** — push, merge to master, version bump (next free patch after a
   fresh `git fetch --tags` + `git ls-remote --tags origin`; expected `0.1.21`), tag, GitHub
   release, refresh, dogfood — via `rtc-ship.sh` run against the WORKTREE. Never force-push,
   never move/delete a published tag, never rewrite master.
5. TDD; each important behaviour gets a discriminant (known-bad turns the test RED first); never
   weaken a test.
6. Milestone QC follows §6b and its playbook (it governs where it differs from this rule).
   Verify each milestone with an independent offload (stateless `free-agent-tool.py`, role
   validator, cross-family from your own model; or a headless free session
   `remote-session.sh <alias> --prompt-file <brief> -p` when it must run commands — NOT
   `-p "<text>"`, the launch guard blocks that form). Confirm findings in source. Record
   `model_used` + route in the receipt.
7. Network timings MUST force IPv4 (`curl -4`, `yt-dlp --force-ipv4`). ≤ 30 yt-dlp runs/hour.
8. Never `remote-session.sh --stop`; never kill anything on 4141–4151 or pid 59875; never launch
   an interactive successor — you ARE the successor.
9. Never write `~/Library/Application Support/app.echoprism/*` (read with `sqlite3 -readonly`).
   No argv, keys or tokens in receipts.
10. Append one line per receipt to §8 below, committed with that task.

## 5. Phase 0 — preflight (read-only first)
- [ ] Three strategy sentences. Then: `git -C ~/ClaudeWorkspace/echoprism log --oneline -3`,
      `git fetch --tags origin`, latest tag, `git worktree add -b feat/v0120-followups
      ~/.wt/ep-followups master`, `npm ci` in the worktree.
- [ ] Baselines (redirect to files, echo `EXIT:$?`): `cargo test --workspace --manifest-path
      src-tauri/Cargo.toml`, `npm run test:run`, `npm run test:e2e`, and `cargo build
      --manifest-path src-tauri/Cargo.toml 2>&1 | grep -c warning` (record the warning count —
      Task 3 drives it down).
- **Receipt 0:** outputs, counts, worktree path, latest tag.

## 6. Tasks

### Task 1: WebKit project + HLS e2e
**Files:** `playwright.config.ts` (add `{ name: 'webkit', use: { browserName: 'webkit' } }`
next to chromium; keep chromium); create `e2e/fixtures/hls/` (a committed, tiny VOD: generate
once with ffmpeg — 2 variants 180p + 360p, ~4 s, low bitrate, a master `master.m3u8`; total
size target < 300 KB; add a `README.md` with the exact ffmpeg commands); create
`e2e/hls.spec.ts`; `src/mocks/router.ts` (a mock stream whose `url` points at the fixture
master and whose `fallback_url` points at a progressive mp4 fixture — create a ~1 s mp4 too).
- How the fixture is served: decide (Vite `public/`-style test path, or Playwright `page.route`
  fulfilling from disk). Record the choice. It must not ship in the production bundle — verify
  with `npm run build` + `grep -r master.m3u8 dist` → no hit (or document why it is harmless).
- Specs (run in the **webkit** project only; `test.skip(browserName !== 'webkit', …)`):
  `hls_video_plays_in_webkit` (video reaches `playing`, `videoWidth > 0`);
  `broken_hls_falls_back_to_progressive` (mock master 404 → element ends up on `fallback_url`
  and plays); `capped_master_lists_no_variant_above_cap` — exercise the real
  `filter_master_playlist` output if reachable from e2e, else assert in a Rust test that the
  proxy route serves the filtered fixture (state which).
- **Discriminant:** point the mock at a nonexistent master with fallback removed →
  `hls_video_plays_in_webkit` RED; restore.
- Run: `npm run test:e2e -- --project=webkit e2e/hls.spec.ts` and the whole suite in both
  projects. Existing chromium specs must stay green; webkit failures in OLD specs are reported,
  and either fixed (if the app is genuinely wrong in WebKit — the shipped app IS WebKit) or
  scoped to chromium with a one-line reason each. Never silently drop one.
- Commit `test(e2e): WebKit project and HLS playback/fallback specs`.
- **🧪 Receipt 1:** `npm run test:e2e > /tmp/<dir>/e2e.txt 2>&1; echo EXIT:$?` → EXIT:0 with
  per-project pass counts (chromium count ≥ Receipt 0); the discriminant's RED run; fixture size
  (`du -sh e2e/fixtures/hls`); the `dist` grep result; offload verdict + `model_used`.

### Task 2: Cold audio ≤ 5 s
- [ ] **Measure first** (scratch script outside the repo, `--help`): for 3 videos, from the
      HLS master yt-dlp returns with the current `YT_DLP_EXTRACTOR_ARGS`, find audio-only
      renditions (`#EXT-X-MEDIA:TYPE=AUDIO` URIs, or audio-only variants), and check: no
      `available_at` lock (fetch immediately, every 300 ms for 3 s), codec (`CODECS=` mp4a/opus),
      no video codec, plays in Playwright WebKit (reuse the probe), and bytes per minute vs the
      progressive m4a (format 140). Write the table to the findings doc.
- [ ] If a usable audio-only HLS rendition exists: audio mode resolves to it (primary), with the
      progressive audio-only candidate as `fallback_url`. Tests: `audio_hls_rendition_selected`
      (fixture master with audio groups → the audio rendition URI), `audio_hls_never_contains_video`
      (a rendition with `avc1` in CODECS is rejected), `audio_falls_back_to_progressive_when_no_rendition`.
      Discriminant: accept a video variant → second test RED.
- [ ] Live re-measure cold audio and cold video through the real resolve path (ignored live
      tests, IPv4). Target ≤ 5 s each (click→URL; state that first-frame is not measured
      unattended).
- [ ] **If cold audio is still > 5 s:** build the persistent extractor (owner-approved
      2026-11-16): a long-lived yt-dlp process (Python, `yt_dlp.YoutubeDL` in a small helper
      script spoken to over stdin/stdout JSON lines) started lazily on first use, restarted on
      crash, killed with the app, honouring `--force-ipv4`/NetPath and `YT_DLP_EXTRACTOR_ARGS`,
      with a per-request timeout and fall back to the one-shot `yt-dlp -J` on any helper failure.
      Tests with a fake helper (crash → restart → fallback; timeout → fallback). The helper gets
      `--help`. Re-measure.
- [ ] Close `echoprism-cold-start-still-5` ONLY with measured evidence ≤ 5 s
      (`waypoints.py done … --evidence`); otherwise edit it with the new numbers and leave open.
- Commit(s) `perf(audio): …` per milestone.
- **🧪 Receipt 2:** the measurement table (per video: rendition found y/n, CODECS, lock y/n,
  WebKit plays y/n, bytes/min vs format 140); RED→GREEN runs of the three named tests; live cold
  audio + cold video ms per stage (`ResolveTimings`) vs 5000 ms; whether the helper was built
  and, if so, its crash/timeout test runs; the waypoint command used; offload verdict.

### Task 3: v0.1.20 cleanup
- [ ] Dead code: `InstancePool::mark_degraded` / `note_resolve_outcome` (unused since resolve
      feedback moved to stream maps — confirm with grep), `PollOutcome.status/waited` (read them
      in the startup timings or delete), `CachedStream.fallback` vs `StreamInfo.fallback_url`
      (keep ONE). Remove only what grep proves unused; keep pinned behaviour tests passing.
      Target: `cargo build` warnings from Phase 0 count → 0 introduced by v0.1.20 (state counts).
- [ ] Net-monitor helper: load `libepnetmonitor.dylib` at RUNTIME (`dlopen` via `libloading`,
      pinned) from the bundle Resources path, then the dev `OUT_DIR`/`gen` path; on failure log
      one warning, report `audio_only_on_metered` as unavailable (setting disabled in Settings
      with a short reason), and NEVER block launch. Tests: `missing_helper_does_not_panic_and_reports_unavailable`
      (point the loader at a nonexistent path); discriminant: make the loader `unwrap()` → RED.
      Live: copy the debug binary to a temp dir and launch it → app starts (no dyld error).
- [ ] Close `echoprism-v0-1-20-follow-ups` with evidence.
- Commit `chore: remove v0.1.20 dead code; load net-monitor helper at runtime`.
- **🧪 Receipt 3:** grep proof for each removed symbol (0 non-test call sites); `cargo build`
  warning count before → after; RED (unwrap) → GREEN for the missing-helper test; the temp-dir
  launch result (app alive / dyld error text); full rust suite EXIT:0; offload verdict.

### Task 4: Final review + ship through release
- [ ] Full gates: rust workspace, vitest, e2e **both projects**, `npm run build`, eslint,
      `tests/test_version_consistency.sh` after the bump — counts vs Receipt 0.
- [ ] Whole-branch review (superpowers:requesting-code-review) + offloaded cross-family review
      of `git diff master...feat/v0120-followups`; fix confirmed findings.
- [ ] `git fetch origin`; rebase onto the latest master (local canonical master may have moved —
      see §3); rerun gates if anything changed. Bump version everywhere; CHANGELOG entry.
- [ ] Ship with `rtc-ship.sh` against the WORKTREE; verify `git ls-remote --tags origin`,
      `gh release view v<ver>`; fast-forward the canonical checkout ONLY if it is clean and on
      master (`git -C ~/ClaudeWorkspace/echoprism pull --ff-only`), never otherwise.
- [ ] Dogfood: launch the released/canonical build; play one HLS video, one audio-only item;
      record `recent_startups` or stdout `startup` lines, or state "not tested".

- **🧪 Receipt 4:** gate counts vs Receipt 0 (each `EXIT:`); review findings + fixes with
  file:line; the rebase base SHA; `git ls-remote --tags origin | grep v<ver>`; `gh release view
  v<ver> --json tagName,isDraft,url`; canonical checkout `git status -sb` after the ff-pull;
  dogfood numbers or "not tested".

## 6b. Quality-control milestones (owner, 2026-11-16: use the milestone-QC playbook)

Playbook: `~/.claude/plans/_PLAYBOOKS/Playbook-milestone-qc-offload-test-proof.md` — READ IT IN
FULL before Task 1. Its six hard rules (declaration is never a proof; selectors/routes must hit a
live target; reachability from the shipped entry point; the executor's explanation is a claim;
look at it; free-lane executor ⇒ independent effect check) apply to every milestone below, and a
milestone cannot close while any is violated. It supersedes the lighter "offload cross-check"
wording of standing rule 6 wherever they differ.

**Standing rule (verbatim from the playbook):** *"At each milestone, run /offload
(free-agents:offload) — a stateless dispatch to an out-of-family reviewer — with the brief below.
Treat its findings as hypotheses: run every proposed mutation; fix or rebut each finding with
evidence. Do not start the next task with an open finding."* The brief is the playbook's
"dispatch brief" section, copied as-is, with the files attached via `"files"`.

| Milestone | Requirements under review (spec/plan wording) | Delivery-shaped proof required |
|---|---|---|
| **M1 after Task 1** | WebKit plays the HLS master; broken HLS falls back to the progressive file; the master served lists no variant above the cap | e2e asserts `videoWidth > 0` AND `currentTime > 0` in the webkit project through the app's real player path (not a bare `<video>` page); fixture absent from `dist` |
| **M2 after Task 2** | cold audio ≤ 5 s; audio-only never fetches video bytes | live timing numbers in the receipt; a test whose fixture contains a VIDEO-bearing rendition that must be rejected; the CODECS of the rendition actually played |
| **M3 after Task 3** | a missing net-monitor helper never blocks launch; removed symbols were truly unused | the app binary launched from a temp dir with no helper shows the app alive (not just a unit test); grep proof per symbol |
| **M4 before ship** | everything above, on the rebased branch | re-run M1–M3 delivery probes on the final commit |

Per playbook hard rule 6: at each milestone, at least one delivery-shaped probe must be run by a
DIFFERENT model than the one that wrote the code (a headless free session on another family via
`remote-session.sh <alias> --prompt-file <brief> -p`), and its output quoted in the receipt.
Every mutation a reviewer proposes is applied in isolation and must go RED (verify it was applied:
`git diff` shows it), then restored (`git diff` empty). Record per milestone: model + route,
verdict table, each mutation's RED line, final green line, rebuttals citing file:line.

## 7. Adversarial review
Format: tempting shortcut → plausible false success → harm → rule → detecting test/receipt.
- Edit or switch the canonical checkout → works locally → the owner's live session and dev
  launcher see half-built code → rule 2 / matrix → Receipt 4 `git status -sb` of canonical.
- `cmd | tail` in a gate → pipe hides a red exit → broken release → redirect to file + `EXIT:$?`
  → every receipt shows `EXIT:`.
- Skip the discriminant → green-but-inert test → regression ships → rule 5 → each receipt shows
  the RED run.
- Rebase skipped before shipping → push rejected or another session's commit lost → Task 4 fetch
  + rebase → Receipt 4 rebase base SHA.
- Pick a version from memory → tag collides with another session's → fresh `fetch --tags` +
  `ls-remote` → Receipt 4.
- Trust a free reviewer's finding blindly → hallucinated file → wasted or wrong fix → confirm in
  source → receipts quote file:line.
- Measure without IPv4 → 183 s blackhole numbers → wrong conclusion → rule 7 → `real` vs `user`.
- Build the persistent helper without measuring first → unneeded complexity → matrix gate →
  Receipt 2 shows the measurement before any helper commit.
- E2E passes in WebKit because the mock never actually loads the fixture → green-but-inert →
  assert `videoWidth > 0` and `currentTime > 0` after playing, not just a resolved promise.
- Fixture leaks into the production bundle → bloat/confusion → `npm run build` + grep `dist`.
- "Audio-only HLS" variant actually carries video → video bytes in audio mode (anti-goal) →
  `audio_hls_never_contains_video` + CODECS check in the measurement table.
- Persistent helper hangs → every click waits → per-request timeout + one-shot fallback test.
- Shipping while the owner's live session committed to canonical master → lost commit or a
  rejected push → fetch + rebase immediately before `rtc-ship.sh`; never force.
- Waypoint closed on an estimate → false done → close only with a measured number in `--evidence`.

## 🏁 Final delivery (answer each in the last report)
Implemented vs only planned (e.g. helper not needed / not built)? Which receipts ran, which
tests did not (GUI first-frame)? Cold audio + cold video measured vs 5 s — met / not met? Is the
owner's work preserved (canonical checkout untouched except ff-pull; pid 59875 untouched; live
app data untouched)? Any secrets in receipts? Released version, tag and URL as verified by
`ls-remote` / `gh`? Waypoints closed (with evidence) or updated? Did the run stop at release +
refresh + dogfood and nothing beyond? Was this file reread before reporting?

## 8. Progress log (one line per receipt: date · task · commit · result)
- 2026-11-16 · plan written · planning session (Opus 5.5) · execution not started
