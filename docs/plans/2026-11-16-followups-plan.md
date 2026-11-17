# v0.1.20 follow-ups — WebKit HLS e2e, cold audio ≤ 5 s, cleanup — Plan + Handoff

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (NATIVE: implement
> every task yourself, then one final whole-branch review). Entry point: `run-to-completion:autopilot`
> with this file as the queue. Checkbox (`- [ ]`) steps.

**Status:** in-progress
> **Lasting Plans:** when every task below is done, set the Status line to
> `completed` by running `lasting-plans complete "<this file>"` as the closing step.

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
| Create worktree `~/.wt/ep-startup-fixes`, edit, local commits on `feat/startup-fixes` | allowed now | Receipt 0 |
| Add `libloading` (Rust) or any npm/crate dependency | allowed after gate | pinned version, named in the task receipt |
| Generate + commit e2e media fixtures with ffmpeg | allowed now | < 300 KB total, README with commands |
| Build the persistent extractor helper | allowed now (REQUIRED, Task 2b) | owner-approved 2026-11-16; root cause proven (§10 B) |
| Spawn/kill the helper process the app itself starts (in tests: fake helper) | allowed now | tests kill what they start; never other processes |
| Launch the app binary for a live check / dogfood | allowed now | your own build; quit it afterwards |
| Push branch, merge to master, bump, tag, GitHub release, refresh | allowed after gate | Task 4 gates green, via `rtc-ship.sh` on the WORKTREE |
| Force-push, move/delete a published tag, rewrite master | **prohibited** | fix forward |
| Edit/reset/switch the canonical checkout `~/ClaudeWorkspace/echoprism` | **prohibited** | except the final `pull --ff-only` when clean on master |
| Write `~/Library/Application Support/app.echoprism/*` | **prohibited** | `sqlite3 -readonly` only |
| Kill pid 59875 (if it revives), pid 29663 / session `ac3848bc`, anything on ports 4141–4151, `remote-session.sh --stop` | **prohibited** | — |
| Launch another free session / handover from the executor | **prohibited** — owner only (handoff 2026-11-16) | you ARE the successor |
| Edit THIS plan file (`docs/plans/*`) | **allowed, append-mostly** (owner ruling, 2026-11-16 ~20:36 UTC): §8 receipt lines are committed with each task (rule 10); wording may be refined when NEW VERIFIED information requires it, never overriding an owner decision; doc-only commits to `docs/plans/*` are permitted; the completion marker (`lasting-plans complete`) runs only at the very end | single source of truth = this file on master; pin the SHA you read at Phase 0 |
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

## 3. State (re-verified live 2026-11-16 ~18:05 UTC by the plan-airtight pass; earlier readings dated)
- *confirmed live ~18:05 UTC:* `origin/master` = `4128c27b` (= tag `v0.1.20`, highest tag).
  Local canonical `master` = `d1b82056`, **8 docs commits ahead** and unpushed:
  `2f931976`, `a7bcdef3`, `05f5cd94`, `32167417`, `e4799ea8`, `bc100a2a`, `5258c37d`, `d1b82056`
  (all `docs(plans)`, this plan's own history). The ship pushes them; do not drop them.
  Expected next version: `0.1.21` (fresh `fetch --tags` + `ls-remote` before bumping — Task 4).
  *confirmed live ~18:20 UTC:* the plan-airtight commit `8c05e73a` was PUSHED to origin and
  verified via `git ls-remote origin refs/heads/master` → `8c05e73a…`; plan-hardening commits land
  on canonical master by path and are pushed the same way (docs-only).
- *dated ~10:40 UTC, no longer live:* pid 59875 (v0.1.20 executor) was in the session registry
  then; *confirmed live ~18:05 UTC:* it is NOT in `~/.claude/sessions/*.json` anymore. The
  **active successor is `ac3848bc` (pid 29663, cwd `~/ClaudeWorkspace/echoprism`, started
  12:03 UTC)**, launched with the instruction to follow this plan and work only in
  `~/.wt/ep-startup-fixes`. Treat that session as live: it may commit/push at any time. NEVER
  edit, reset or switch the canonical checkout's code, and never kill or message it; fetch +
  rebase your branch on the latest local AND remote master right before shipping.
- *confirmed live 2026-11-16:* Playwright 1.64.1 with `webkit-2370` installed; WebKit plays
  native HLS — `canPlayType('application/vnd.apple.mpegurl') === "maybe"`, an ffmpeg HLS VOD
  (320×180, 2 s segments, `application/vnd.apple.mpegurl` + `video/mp2t`) reached `playing`,
  `videoWidth 320`. Probe script: `/tmp/ep-wk/probe.cjs` (may be gone; recreate if needed).
- *confirmed in source:* `playwright.config.ts:33` → `projects: [{ name: 'chromium', … }]` only.
- `ffmpeg` at `/opt/homebrew/bin/ffmpeg`.
- Open waypoints this round closes: `echoprism-cold-start-still-5`, `echoprism-v0-1-20-follow-ups`.
  (`echoprism-audio-only-checkbox` is WATCH only — do not touch.)
- **Superseded executor, do not touch:** an earlier successor (pid 40055) went idle at 11:46 UTC
  with NO work done; it left worktree `~/.wt/ep-followups` (branch `feat/v0120-followups`, no
  commits). Never use, edit, remove or kill either; you use `~/.wt/ep-startup-fixes`.
- *confirmed live ~18:05 UTC:* `~/.wt/ep-startup-fixes` EXISTS, branch `feat/startup-fixes` at
  `5258c37d` (2 docs commits behind local master `d1b82056`, no feature commits yet). Phase 0
  must rebase it onto the latest master before any edit; Task 4 re-checks right before ship.
  `~/.wt/ep-debug` (detached `e4799ea8`) and `~/.wt/ep-round13` also exist — not yours, ignore.
- The canonical checkout may show uncommitted edits that are NOT yours (seen: 
  `docs/plans/2026-11-15-cold-path-findings.md`, from the owner's live session). Never stage,
  revert or overwrite them.
- Planning-session scratch worktree `~/.wt/ep-debug` (detached, debug trace) is NOT yours — ignore it.

## 4. Standing rules (adopt for the whole session)
1. Autonomous: decide and record; stop only for forks that cannot be weighed.
2. Work ONLY in worktree `~/.wt/ep-startup-fixes` (branch `feat/startup-fixes`, created from local
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
11. If your worktree shows `docs/plans/*` dirty: if the diff is only your §8 progress-receipt
    lines, COMMIT it with your task (rule 10 — progress documentation belongs in the plan).
    If it contains requirement/task/matrix edits, keep them only if they rest on new verified
    information and never override an owner decision; otherwise copy the file to a `mktemp -d`
    path and restore the pinned SHA's version (`git checkout <pinned-sha> -- docs/plans/`).
    Record which case it was in the receipt. (Owner ruling 2026-11-16 ~20:36 UTC supersedes the
    earlier blanket "never commit the plan file" wording.)

## 5. Phase 0 — preflight (read-only first)
- [ ] Three strategy sentences. Then: `git -C ~/ClaudeWorkspace/echoprism log --oneline -3`,
      `git fetch --tags origin`, latest tag, `git rev-parse master` (record it — the plan commit
      you read is the target, not a moving guess), `git worktree add -b feat/startup-fixes
      ~/.wt/ep-startup-fixes master` **or**, if the worktree already exists (confirmed live
      2026-11-16: `~/.wt/ep-startup-fixes` @ `5258c37d`), `git -C ~/.wt/ep-startup-fixes
      fetch origin && git -C ~/.wt/ep-startup-fixes rebase master` and record the new base;
      `git -C ~/.wt/ep-startup-fixes status --porcelain` must be empty before the first edit;
      `npm ci` in the worktree.
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

### Task 2: Playback start — the PROVEN root causes (planning session, 2026-11-16, see §10)
Root causes are established; do not re-investigate them — implement the solutions, then
prove the outcome. Each sub-task below is its own commit and its own receipt.

#### 2a. Audio-only plays the audio-only HLS rendition (fixes the ~113 s audio start)
- Cause (§10 A): progressive audio-only m4a (139/140) is a FRAGMENTED MP4; WebKit/AVFoundation
  walks every fragment (one HTTP hop each, ~158 for a 25 MB file) before `playing`.
- [ ] Audio mode selects a yt-dlp format with `protocol == "m3u8_native"`, `vcodec == "none"`,
      `acodec != "none"` (observed ids `233`/`234`; prefer the higher `abr`/`tbr`), served by its
      `url` (a media playlist; verify whether it needs headers — §10 measured it playing with
      none in WebKit; proxy it only if headers are required). Progressive audio-only becomes
      `fallback_url` (gated as today). No muxed/video format may ever be chosen.
- [ ] Tests: `audio_mode_prefers_audio_only_hls` (fixture dump containing 233/234 + 140 →
      233/234 chosen); `audio_hls_with_video_codec_rejected` (a fixture m3u8 entry with
      `vcodec: avc1` is never chosen); `audio_falls_back_to_progressive_without_hls`.
      Discriminant: drop the `vcodec == "none"` filter → second test RED.
- [ ] **Delivery proof (playbook rule 1):** WebKit e2e/live: audio mode reaches `playing` with
      `currentTime > 0` in ≤ 3 s for one real video, and the proxy/network log shows NO
      fragment-hop pattern (≤ 5 media requests before `playing`).

#### 2b. Persistent pre-warmed extractor (fixes the 13–32 s yt-dlp cost; now REQUIRED)
- Cause (§10 B): each click spawns a new yt-dlp; start-up alone stalls 10–30 s on this Mac
  (15.9 s before the first stderr line; real ≫ user CPU); a warm process extracts in 1.5–2.4 s.
- [ ] A long-lived helper: `src-tauri/resources/ytdlp_helper.py` (gets `--help`), run with the
      SAME Python yt-dlp uses (resolve the interpreter from the `yt-dlp` script's shebang, as
      §10 did; fail loudly with a log line if it cannot be resolved), importing `yt_dlp` ONCE,
      reading one JSON request per stdin line (`{"id","video_id","force_ipv4"}`), writing one
      JSON line back (`{"id","ok","info"| "error"}`) with the `extract_info(..., download=False)`
      dict (sanitized via `YoutubeDL.sanitize_info`). Options: `source_address 0.0.0.0` when
      force_ipv4, `socket_timeout 15`, no warnings suppressed (warnings go to stderr → app log).
- [ ] Started at APP LAUNCH (pre-warm: one throwaway `import` happens immediately), restarted
      on crash, killed with the app, per-request timeout 30 s, serialized or bounded concurrency
      (decide; record why), and on ANY helper failure fall back to the one-shot `yt-dlp -J`.
- [ ] Tests with a FAKE helper script in a temp dir: `helper_reused_across_requests` (one spawn,
      N requests), `helper_crash_restarts_then_serves`, `helper_timeout_falls_back_to_oneshot`,
      `helper_missing_python_falls_back_to_oneshot`. Discriminant: spawn per request → first RED.
- [ ] **Delivery proof:** ignored live test — after warm-up, 3 consecutive cold resolves of
      different videos each ≤ 4 s click→URL (`ytdlp_ms` ≤ 3000).

#### 2c. One extraction serves both modes; config + timer truth
- [ ] A pre-resolve (hover/queue) caches BOTH `(id, Audio)` and `(id, Video)` entries from the
      SAME dump (audio HLS + video HLS master + their fallbacks), so a mode switch is a cache
      hit. Test: `one_dump_populates_both_modes` (resolver counter == 1 for audio then video).
- [ ] Drop `player_client=mediaconnect` (§10 C: unsupported, silently ignored). Stop passing
      `--no-warnings` to `-J` runs; route yt-dlp stderr warnings to the app log at WARN.
      Test pins that no unsupported-client warning appears for the configured args (fake binary
      echoing the argv is enough for the argv half; the live test checks the real warning text).
- [ ] Timer truth (§10 D): `instances_ms` measures ONLY the instance attempts; a click that
      JOINED an in-flight resolve reports `path="joined"` with the wait; `source` reflects the
      mode actually played (video vs audio), not the toggle at click time. Tests pin each.
- [ ] Close `echoprism-cold-start-still-5` ONLY with measured evidence (cold audio AND cold
      video ≤ 5 s click→first-frame from `recent_startups` or stdout `startup` lines of a real
      dogfood run); otherwise update it with the numbers and leave it open.
- **🧪 Receipt 2 (a/b/c):** RED→GREEN runs of every named test; each discriminant's RED line;
  the delivery proofs' numbers; the before/after `ResolveTimings`; offload verdicts (§6b M2).

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
      **CORRECTION (live test 2026-11-16, see §9): the RELEASED v0.1.20 .app does NOT work** —
      its binary links the helper by an ABSOLUTE CI path
      (`/Users/runner/work/echoprism/…/out/libepnetmonitor.dylib`), dyld aborts (exit 134) on
      every Mac. A local build only "works" because its own OUT_DIR path exists. The fix must
      remove the link-time dependency entirely (runtime `dlopen`, no `-l` link of the helper), so
      `otool -L <binary> | grep -c netmon` == 0. Live: run `npm run tauri build`, copy the
      PRODUCED .app to a `mktemp -d` dir, and launch THAT (not the debug binary) → app alive.
- [ ] Close `echoprism-v0-1-20-follow-ups` with evidence.
- Commit `chore: remove v0.1.20 dead code; load net-monitor helper at runtime`.
- **🧪 Receipt 3:** grep proof for each removed symbol (0 non-test call sites); `cargo build`
  warning count before → after; RED (unwrap) → GREEN for the missing-helper test; the temp-dir
  launch result (app alive / dyld error text); full rust suite EXIT:0; offload verdict.

### Task 4: Final review + ship through release
- [ ] Full gates: rust workspace, vitest, e2e **both projects**, `npm run build`, eslint,
      `tests/test_version_consistency.sh` after the bump — counts vs Receipt 0.
- [ ] Whole-branch review (superpowers:requesting-code-review) + offloaded cross-family review
      of `git diff master...feat/startup-fixes`; fix confirmed findings.
- [ ] `git fetch origin`; rebase onto the latest master (local canonical master may have moved —
      see §3); rerun gates if anything changed. Bump version everywhere; CHANGELOG entry.
- [ ] Ship with `rtc-ship.sh` against the WORKTREE; verify `git ls-remote --tags origin`,
      `gh release view v<ver>`; fast-forward the canonical checkout ONLY if it is clean and on
      master (`git -C ~/ClaudeWorkspace/echoprism pull --ff-only`), never otherwise.
- [ ] **Release-artifact launch gate (added after the v0.1.20 dyld incident):** once CI attaches
      the dmg, `gh release download v<ver> --pattern '*.dmg'` into `mktemp -d`, `hdiutil attach
      -nobrowse -readonly`, `otool -L` the binary (no `/Users/runner` path), and launch the
      binary from the mount for ≥ 10 s → alive. If it crashes: delete the dmg asset
      (`gh release delete-asset`), fix forward, and report — never leave a non-launching asset up.
- [ ] **Homebrew tap (owner, 2026-11-16):** bump `haiggoh/homebrew-tap` `Casks/echoprism.rb`
      `version` + `sha256` (of the verified dmg) via a branch + PR or a direct commit per that
      repo's convention; verify `brew update && brew info --cask echoprism` shows `<ver>`. Only
      after the launch gate above passed.
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

Operative additions for this repo (plan-airtight pass 2026-11-16, from the playbook text):
- **Declared ≠ delivered:** every user-visible requirement needs ≥ 1 DELIVERY-shaped assertion
  (computed style / on-screen region / pixels in a screenshot / bytes on disk / argv actually run
  / output the user sees). Existence-only, source-contains-string, mock-called and exit-0
  assertions never close a milestone.
- **Selectors/routes hit a live target:** a CSS selector, hook matcher, route or filter is proven
  only by asserting it matches ≥ 1 live target AND that the effect changes when it is removed.
- **Default entry path:** ≥ 1 test per user-visible feature goes through the path the user actually
  runs (the app's real player path / the shipped launcher, no injected wiring) — or the plan names
  why that is impossible.
- **Root-cause claims flip:** a stated cause counts only with a probe whose result FLIPS with the
  cause (revert fix → symptom back; apply only the claimed cause → symptom gone). "Fixed, verified"
  without the quoted probe output = unverified.
- **Look at it:** UI-visible changes get a Playwright screenshot inside the e2e spec, asserted on
  pixels/region (e.g. `expect(locator).toBeVisible()` + bounding box, or a screenshot diff), and the
  executor inspects the image. If only human eyes can check, the receipt names the exact manual
  step and never claims it.
- **Skip accounting:** every milestone receipt lists skips/ignores
  (`grep -rnE '\.skip\(|it\.skip|test\.skip|#\[ignore\]' <dirs>` plus the vitest verbose reporter)
  and states "0 unexpected" or names each one.
- **Reviewer findings:** reported as "N of M sampled", never extrapolated; each claimed finding is
  verified against the actual file (diff it) before it is fixed or rebutted.

**Standing rule (verbatim from the playbook):** *"At each milestone, run /offload
(free-agents:offload) — a stateless dispatch to an out-of-family reviewer — with the brief below.
Treat its findings as hypotheses: run every proposed mutation; fix or rebut each finding with
evidence. Do not start the next task with an open finding."* The brief is the playbook's
"dispatch brief" section, copied as-is, with the files attached via `"files"`.

| Milestone | Requirements under review (spec/plan wording) | Delivery-shaped proof required |
|---|---|---|
| **M1 after Task 1** | WebKit plays the HLS master; broken HLS falls back to the progressive file; the master served lists no variant above the cap | e2e asserts `videoWidth > 0` AND `currentTime > 0` in the webkit project through the app's real player path (not a bare `<video>` page); fixture absent from `dist` |
| **M2 after Task 2** | audio-only plays the audio-only HLS rendition and never fetches video bytes; ONE warm extractor serves all requests; one dump serves both modes; timer splits are truthful | audio reaches `playing` + `currentTime > 0` in ≤ 3 s with ≤ 5 media requests (no fragment walk); live: 3 consecutive cold resolves ≤ 4 s with a single helper pid; a fixture with a VIDEO-bearing m3u8 entry that must be rejected; the CODECS of the stream actually played |
| **M3 after Task 3** | a missing net-monitor helper never blocks launch; removed symbols were truly unused | the app binary launched from a temp dir with no helper shows the app alive (not just a unit test); grep proof per symbol |
| **M4 before ship** | everything above, on the rebased branch | re-run M1–M3 delivery probes on the final commit |

Per playbook hard rule 6: at each milestone, at least one delivery-shaped probe must be run by a
DIFFERENT model than the one that wrote the code (a headless free session on another family via
`remote-session.sh <alias> --prompt-file <brief> -p`), and its output quoted in the receipt.
Every mutation a reviewer proposes is applied in isolation and must go RED (verify it was applied:
`git diff` shows it), then restored (`git diff` empty). Record per milestone: model + route,
verdict table, each mutation's RED line, final green line, rebuttals citing file:line.

## 6c. Suite parallelism, per-file timing and splitting (Playbook-split-monolithic-test-suites + standing rule "full-suite runs go parallel first")

- **Gates run parallel, always:** vitest (file-parallel by default), Playwright (per-file workers;
  `npx playwright test --shard=i/n` only if CI needs it), `cargo test` (tests within a binary run
  on threads; separate `tests/*.rs` binaries run ONE AFTER ANOTHER — only `cargo nextest`
  parallelizes binaries, and only adopt it if a single Rust binary is the measured floor). Never
  run a full gate serially "to be safe"; targeted single-file reruns during a red-green cycle stay
  serial.
- **Phase 0 / Receipt 0 must record PER-FILE timings, not just totals:** loop over the e2e specs
  and vitest files (`for f in e2e/*.spec.ts src/**/*.test.ts(x); do /usr/bin/time -l npx playwright
  test "$f" …; done`, `npx vitest run "$f"` per file; `for b in tests/*.rs`-derived binaries,
  `cargo test --test <name>`), each redirected to a file with `EXIT:$?`, and record wall time per
  file. The slowest file is the candidate floor.
- **Split only when ALL THREE hold** (playbook): (1) one file is the floor — slowest, ≥ ~25 % of
  the parallel wall time, next-slowest much faster; (2) its cases are independent (each builds its
  own fixture/scratch state — temp dir, stub server on a FREE port); (3) shared setup is cheap
  (splitting multiplies rig start-up per file). Not a fit: order-dependent cases or a shared fixed
  global resource (hard-coded port, file in `$HOME`) — fix that first.
- **Procedure when triggered:** (1) baseline the monolith: exit code, assertion count, sorted
  assertion lines; (2) extract the rig (helpers/setup/stubs/asserts/summary) into a module the test
  glob does NOT match (`e2e/lib/…`, `tests/helpers/…`, `conftest.py`), deriving paths from the
  module's own location; (3) group cases by theme into N files, each landing ≤ the next-slowest
  file; (4) move cases by LINE RANGE programmatically with a per-slice anchor assert
  (`assert src[n].startswith(...)`) — never retype a case; keep the original filename for the
  first piece; (5) verify EQUIVALENCE, not just green: sorted assertion lines before == union
  after (diff identical), counts match, plant a failure through the shared summary → RED, then run
  the REAL gate (`rtc-ship.sh` test phase), not only a harness; (6) re-time per file and iterate on
  the new floor; (7) if someone else edits the monolith mid-split, let theirs land and redo the
  slicing from the new file.
- **Rust note:** within one test binary, tests already run on parallel threads — splitting a
  binary only pays under nextest. Vitest/Playwright are file-parallel, so split the FILE and put
  shared setup in a helper module.

### Task 5 (after Task 4 has shipped): optional "YouTube player" video mode (owner, 2026-11-16)
Ships as its OWN next patch release through the same Task 4 gates (authority unchanged:
through release). Off by default; a Settings toggle "Use YouTube's player for video (faster
start, may show ads it fails to block)".
- **Spike facts (§11, confirmed live in Playwright WebKit):** warm player loads the next video
  in **0.46 s**; cached cold 1.3–1.9 s; truly cold 5.4 s; a page WITHOUT a referrer gets
  `error 153`; embed-disabled videos give `error 150`.
- **Mechanism (decision):** the stream proxy serves `/embed/player.html` (IFrame Player API,
  host `https://www.youtube-nocookie.com`, `origin` = the proxy origin) and the app shows it in
  an `<iframe>` — YouTube sees a valid `http://127.0.0.1:<port>` referrer, the app's own
  `tauri://` origin is untouched. Control via `postMessage` (play/pause/seek/load, state +
  time events) — the existing queue, SponsorBlock skips (`seekTo`) and start-up timer must work
  through it. ONE warm player instance is kept alive and reused (`loadVideoById`).
- **Fallback (decision):** player `onError` 150/101/153/5/100 → play the same item through the
  extractor pipeline without user action; log one line. Audio-only mode NEVER uses the embed.
- **Brave-level ad blocking (owner):** (1) a WKWebView content rule list (Safari content-blocker
  JSON) for ad/tracking hosts and YouTube ad endpoints (e.g. `/pagead/`, `/api/stats/ads`,
  `doubleclick.net`, `googlesyndication.com`, `/ptracking`), attached to the webview via the
  platform hook (Tauri `with_webview` → `WKUserContentController addContentRuleList`); (2) a
  `WKUserScript` injected into ALL frames (`forMainFrameOnly: false`) that prunes `adPlacements`,
  `playerAds`, `adSlots` from `ytInitialPlayerResponse` and fetch/XHR JSON responses of
  `/youtubei/v1/player` (uBlock Origin's json-prune pattern). Keep both lists in versioned files
  with a README and a date, since YouTube changes them.
- **Tests:** unit: the prune function on fixture player responses (with and without ad keys;
  non-ad data untouched); WebKit e2e on the proxy-served embed page against a LOCAL stub of the
  IFrame API (no network): play, pause, seek, `onError 150 → fallback` path. Live (ignored) test:
  real video reaches PLAYING ≤ 2 s warm. Discriminant: remove the prune keys → the fixture test
  RED; make `onError` not fall back → e2e RED.
- **Delivery proof (playbook):** a dogfood run with the toggle on: 3 videos, `recent_startups`
  shows warm starts; one embed-disabled video falls back and plays; an ad-carrying video (find
  one; record its id) plays with no ad segment — or record honestly that one slipped through.
- **Receipt 5:** all of the above with numbers; offload milestone M5 (requirements = this task).

## 11. Embed spike (planning session, 2026-11-16 ~12:05 UTC, Playwright WebKit 2370)
Script `/tmp/ep-live.L7Oo/embed*.cjs`. `g5gptFkgBlI`: cold PLAYING 5,415 ms (player ready 3,727 ms)
with referrer; `error 153` at 355 ms with `Referrer-Policy: no-referrer`; cached run 1,332–
1,949 ms; warm `loadVideoById('jNQXAC9IVRw')` → PLAYING in **460 ms**; `9bZkp7q19f0` →
`error 150` (embedding disabled). Ads: none observed on these ids — blocking UNTESTED.

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
- Re-investigate the §10 root causes instead of implementing → hours lost re-deriving known
  facts → §10 is authoritative ("do not re-test") → Receipt 2 starts with RED tests, not probes.
- Warm helper "works" in tests with the fake but the real one re-imports per request → no speed
  gain → delivery proof requires a single helper pid across 3 live resolves.
- E2E passes in WebKit because the mock never actually loads the fixture → green-but-inert →
  assert `videoWidth > 0` and `currentTime > 0` after playing, not just a resolved promise.
- Fixture leaks into the production bundle → bloat/confusion → `npm run build` + grep `dist`.
- "Audio-only HLS" variant actually carries video → video bytes in audio mode (anti-goal) →
  `audio_hls_never_contains_video` + CODECS check in the measurement table.
- Persistent helper hangs → every click waits → per-request timeout + one-shot fallback test.
- Shipping while the owner's live session committed to canonical master → lost commit or a
  rejected push → fetch + rebase immediately before `rtc-ship.sh`; never force.
- Waypoint closed on an estimate → false done → close only with a measured number in `--evidence`.
- Two live sessions on one repo (owner's + successor `ac3848bc`) → both commit to master/worktree →
  lost update or a rejected push → docs-only commits by path; executor never touches canonical;
  fetch + rebase immediately before `rtc-ship.sh` → Receipt 4 rebase base SHA.
- Executor edits or re-reads a MOVING plan file mid-run → requirements drift under it → executor
  pins `git rev-parse HEAD` at Phase 0 and works from that commit; plan updates come only from
  owner/planning sessions (matrix row above) → Receipt 0 records the pinned SHA.
- `rtc-ship.sh` run from the canonical checkout → git steps fail but exit 0 (silent no-ship) →
  run it against the WORKTREE and prove visibility with `git ls-remote --tags origin` /
  `gh release view` → Receipt 4.
- e2e "green" but run without `--project=webkit` → WebKit HLS never exercised → receipt shows
  per-project pass counts, chromium ≥ Receipt 0 AND webkit project present → Receipt 1.
- Resuming from a stale transcript instead of this file → re-investigating proven §10 root causes
  or using dead pids → §10 is authoritative; §3 labels every fact live/dated; Phase 0 re-verifies.
- One e2e/vitest file becomes the gate floor → ship gate stalls at that file's wall time →
  per-file timings recorded in Receipt 0; split per §6c ONLY when all three conditions hold →
  Receipt 4 gate wall time vs Receipt 0.
- Executor's worktree shows `docs/plans/*` dirty → is it §8 receipts (commit per rule 10) or
  requirement edits (owner-ruling case in rule 11)? Misreading the diff and reverting §8 lines
  loses the progress record; committing requirement edits silently makes the plan a moving
  target → rule 11 + matrix row "Edit THIS plan file"; receipt names which case applied.

## 🏁 Final delivery (answer each in the last report)
Implemented vs only planned (e.g. helper not needed / not built)? Which receipts ran, which
tests did not (GUI first-frame)? Cold audio + cold video measured vs 5 s — met / not met? Is the
owner's work preserved (canonical checkout untouched except ff-pull and docs-only plan commits;
no live session killed; live app data untouched)? Any secrets in receipts? Released version,
tag and URL as verified by `ls-remote` / `gh`? Waypoints closed (with evidence) or updated? Did
the run stop at release + refresh + dogfood and nothing beyond? Was this file reread before
reporting?

### End-of-life (lasting-plans 2.0.0, repo-resident plan)
This plan lives in a repo (`docs/plans/`), so the closing step is: run
`lasting-plans complete "docs/plans/2026-11-16-followups-plan.md"` — it flips `**Status:**` to
`completed` on a short-lived `docs/plan-followups-complete` branch and pushes that docs-only
branch. The OWNER fast-forward merges it to master (executors must not merge); afterwards the
worktree `~/.wt/ep-startup-fixes` is removed and the remote feature branch deleted. The Status
line above plus this section are the completion signal — never a naming scheme.

## 9. Live test of the v0.1.20 release (planning session, 2026-11-16 10:55–11:00 UTC)
*confirmed live* — released dmg crashed (dyld, exit 134); the run used a copy with the helper
link repointed (`install_name_tool` + ad-hoc sign). Owner deleted the broken dmg asset from the
v0.1.20 release (tag + notes kept). Debug log `RUST_LOG=info,echoprism=debug`:

| Play | click→URL | URL→first frame | Timings |
|---|---|---|---|
| YouTube **audio**, labelled `pre-resolved` | 112.7 s | 25.7 s | ytdlp 32.5 s, **gate 80.6 s**, `cache_hit: true`, `instances_ms` 113.0 s |
| YouTube **video → HLS**, labelled `youtube-audio`/`cold` | 26.7 s | 2.8 s | ytdlp 13.7 s, gate 0 (HLS ungated ✓), `instances_ms` 13.8 s |
| Podcast (enclosure) | 0.04 s | 5.2 s | — |

Findings for this round (each must be resolved or explained with evidence):
- **Gate 80.6 s** ≫ the 10 s ceiling. *Rejected hypothesis:* "some candidates never unlock" —
  polling every progressive audio candidate of a fresh dump, all opened within 0.8–8.3 s
  (format `139` was open immediately). *Unknown:* whether gate_ms includes semaphore queueing
  behind hover prefetches, or the ceiling is per-candidate and re-armed. Instrument and fix.
- **yt-dlp 13.7–32.5 s in-app vs 2.4–6.8 s standalone** (same args, IPv4, measured 11:0x UTC).
  *Hypothesis:* concurrent yt-dlp runs — hover triggers BOTH the storyboard `preview_frames`
  yt-dlp AND the stream prefetch, plus up to 2 prefetches. Measure concurrency; consider sharing
  ONE `-J` dump between storyboard and stream for the same id.
- **Audio first frame 25.7 s** (progressive m4a via proxy) vs **2.8 s for HLS video** — strong
  support for Task 2's audio-only HLS: formats `233`/`234` (`m3u8_native`, audio-only) ARE
  present with `player_client=mediaconnect` for `hRpi46C3dQ4`.
- **Timer mislabels:** a click that awaited a 112 s in-flight prefetch is labelled
  `pre-resolved`; `instances_ms` equals the whole resolve, not the instance step; a video-mode
  play was labelled `source=youtube-audio`. Fix the labels (tests pin each).
- Podcast first frame 5.2 s: check whether the played URL was tracker-stripped (log it).

## 10. Root causes — proven by the planning session (2026-11-16 11:40–12:55 UTC)
Debug build with a per-poll gate trace (`~/.wt/ep-debug`, throwaway, never merged), owner
replayed the same plays. *All confirmed live unless marked.*

**A. Audio ~113 s = fragmented-MP4 walk, not resolution.** Trace: prefetch resolved before the
click (gate 2.63 s: 8×403 then 206), `click_to_url_ms=3` (cache hit), `url_to_first_frame_ms=
112999`. Proxy log: WebKit opens an open-ended Range at successive offsets ~130–200 KB apart
every 0.5–2 s. Box dump of format 140 (`g5gptFkgBlI`, 25,469,150 B): `ftyp 24, moov 699,
sidx 1928`, then `moof`+`mdat` every ~161,618 B ⇒ ~158 fragments. **A/B in Playwright WebKit,
same video:** audio-only HLS `233` → `playing` after **1.13 s**; progressive `140` through a
header-adding proxy → **105.01 s, 101 proxy requests**. Script: `/tmp/ep-live.L7Oo/ab.cjs`.

**B. Video 15–27 s = per-click yt-dlp process start-up.** Rust-spawned `yt-dlp -v` timeline:
first stderr line at **15.91 s**, JS runtimes at 18.59 s, network work 19.88→22.30 s (~2.4 s).
Shell runs vary 2.3–12.2 s wall vs ~1.0 s user CPU. Concurrency REJECTED (4 parallel runs 2.3–
2.6 s each). Warm in-process extraction (one Python, `import yt_dlp` 0.50 s): **1.47–2.38 s**
per video. *Likely, not proven:* endpoint security (Microsoft Defender ESF at 85 % CPU) scanning
the ~1,747 extractor module imports + deno spawn per process. HLS video itself reached first
frame 1.6 s after its URL.

**C. `player_client=mediaconnect` is dead config.** yt-dlp 2026.10.26 prints `WARNING:
[youtube] Skipping unsupported client "mediaconnect"` and uses the defaults (tv, visionos);
`--no-warnings` hid it. The v0.1.20 "fewer clients" measurement measured the defaults.

**D. The "80 s gate" was a mis-split.** First live run reported `gate_ms 80553`; the traced
rerun's gate was 2.63 s and the time sat after URL-ready. `instances_ms` equals the whole
resolve (`extractor/mod.rs:172`), and a joined in-flight prefetch is labelled `pre-resolved`
(`stream_cache.rs:164`). Treat timer splits as untrusted until 2c lands.

**Rejected hypotheses (do not re-test):** candidates never unlocking (all opened in 0.8–8.3 s);
reqwest IPv6 stall (Happy Eyeballs 300 ms is on by default in reqwest 0.12.28); concurrent
yt-dlp slowdown.

**In parallel (planning session):** a throwaway spike of embedding YouTube's own player (IFrame
API) in the app's WebKit with Brave-level ad blocking, for VIDEO mode only. If it is adopted, a
new task will be added to this plan on master; until then video stays on the warm extractor + HLS.

## 8. Progress log (one line per receipt: date · task · commit · result)
- 2026-11-16 · plan written · planning session (Opus 5.5) · execution not started
- 2026-11-16 · plan-airtight pass (max effort, free-lane resume session) · `8c05e73a` (pushed,
  ls-remote-verified) · Status line + Lasting-Plans completion signal added; §3 state re-verified
  live ~18:05 UTC (successor `ac3848bc`/pid 29663 live, worktree `ep-startup-fixes` @ `5258c37d`);
  authority matrix + Phase 0 + adversarial review + end-of-life extended for the two-session reality
- 2026-11-16 · playbook integration pass (milestone-QC operative rules inlined into §6b; new §6c
  suite parallelism/per-file timing/splitting from the split-monolithic playbook; standing rule 11
  for dirty plan files; adversarial rows for gate floor and plan-file drift) · `d8d81574` ·
  plan-airtight re-check: all 8 layers + completion signal present (see header Status line)
- 2026-11-16 · owner ruling codified: rule 11 + matrix row relaxed to append-mostly plan edits —
  §8 receipts committable per task, refinements allowed on new verified info (never overriding
  owner decisions), doc-only `docs/plans` commits allowed, completion marker at the end only ·
  this commit · supersedes the earlier blanket "executor never commits the plan file" wording
- 2026-11-16 · Phase 0 (executor ac3848bc) · pinned plan SHA f3abcf36 · worktree ~/.wt/ep-startup-fixes
  (feat/startup-fixes) rebased onto origin/master f3abcf36, clean before first edit · cargo test
  EXIT:0 233/233 · cargo build EXIT:0, 20 warning lines (3 lib + 15 manifest unused-deps) · vitest
  EXIT:0 399/399 · e2e chromium EXIT:0 35 pass / 8 skip · npm ci EXIT:0 · latest tag v0.1.20 ·
  receipts in /tmp/ep-fix-receipts
- 2026-11-16 · Task 1 + M1 (executor ac3848bc) · this commit · webkit hls 2/2 EXIT:0 (strengthened per
  offload: final-src re-assert, variant-playlist request proof, history-row resolve-path proof,
  observed-404) · discriminants RED: absent-master-no-fallback EXIT:1 both specs; validator mutation
  a1 (broken master + fallback present) EXIT:1 spec 1, restored EXIT:0 · gates: e2e EXIT:0 71 pass /
  19 skip both projects (chromium ≥ Receipt 0, webkit present) · vitest EXIT:0 402/402 (incl.
  hls-fixtures 3/3) · cargo EXIT:0 235/235 solo (sweep flake: 2 gate tests → waypoint
  pre-existing-flaky-rust-tests) · tsc/lint/build EXIT:0 · dist .m3u8 count 0 · fixtures 220K · M1
  offload: validator dispatch model=StepFun Step 5 Preview (family stepfun, avoided zhipu) —
  WEAK(a fallback-masking) / PROVEN(b) / WEAK(c serving path) / receipt-only(dist) → fixed or quoted;
  headless delivery probe nvidia-mistral-large4 (Mistral): all 4 M1 reqs MET (webkit 2/2, fallback
  both runs, cap test ok, BUILD_EXIT:0 M3U8_COUNT:0) · keyboard-nav tab-walk webkit skip rebutted:
  post-region-fix probes still wrap to <body> (t1-kbnav3/4)
- 2026-11-17 · Task 2a (executor ac3848bc) · this commit · audio mode prefers the audio-only HLS
  rendition (m3u8_native + vcodec none + acodec real, abr-desc; §10 A) with progressive audio-only as
  fallback_url · Rust tests audio_mode_prefers_audio_only_hls / audio_hls_with_video_codec_rejected /
  audio_falls_back_to_progressive_without_hls green; discriminant (drop the vcodec-none guard) RED
  EXIT:101 → restored EXIT:0 · webkit e2e delivery proof: audio reaches playing + currentTime>0 with
  4 media requests (playlist + 3 segments) in 2.9 s — §10 A measured 101 requests / 105 s for the
  fragmented m4a · gates: e2e EXIT:0 72 pass/20 skip · vitest 403/403 · cargo 238/238 solo (sweep
  flake = waypoint pre-existing-flaky-rust-tests) · tsc/lint/build EXIT:0 · dist .m3u8 count 0 ·
  fixtures 240K
- 2026-11-17 · Task 2b (executor ac3848bc) · 1a3e9e0f · persistent pre-warmed extractor helper
  (REQUIRED, §10 B): resources/ytdlp_helper.py (--help verified under system python3 AND the
  yt-dlp shebang python; line-JSON protocol; yt_dlp imported once at start = the pre-warm;
  socket_timeout 15; source_address 0.0.0.0 when force_ipv4; warnings→stderr→app log) +
  src/ytdlp_helper.rs (interpreter from the yt-dlp shebang, fail-loud + one-shot fallback;
  spawned at app launch via prewarm_helper in lib.rs; kill_on_drop; restart on crash; 30 s
  per-request timeout; serialized via one mutex — single-process by design, warm extraction
  1.5–2.4 s) · wired into yt_dlp_dump for the stream + storyboard -J calls; ANY helper failure →
  one-shot yt-dlp -J · tests: helper_reused_across_requests (1 pid / 3 reqs),
  helper_crash_restarts_then_serves (new pid), helper_timeout_returns_err_and_respawns,
  missing-script/shebang Err tests, extractor fallback tests helper_timeout_falls_back_to_oneshot +
  helper_unresolvable_python_falls_back_to_oneshot · discriminant spawn-per-request RED (3 pids)
  → restored EXIT:0 · gates: cargo build EXIT:0 · cargo 246/246 solo EXIT:0 (sweep flake = waypoint)
  · e2e EXIT:0 (axe goto-timeout flake rerun 30/30) · vitest/tsc/lint/build EXIT:0 ·
  tauri.conf.json bundles resources/ytdlp_helper.py
- 2026-11-17 · Task 2c (executor ac3848bc) · this commit · ONE -J dump serves both modes (per-video
  dump cache, 10 min TTL — one_dump_populates_both_modes: audio+video resolves → 1 yt-dlp invocation) ·
  dead config removed (§10 C): no player_client=mediaconnect / --extractor-args on any -J run, no
  --no-warnings on -J runs, yt-dlp stderr → app log at WARN (no_dead_client_or_no_warnings_on_j_invocations
  pins the argv; helper stderr forwarded at WARN) · timer truth (§10 D): instances_ms = instance
  attempts only (instances_ms_excludes_ytdlp_time, discriminant RED on the old mis-split), joined
  in-flight → path="joined" + joined_ms wait (stream_cache + startupTimer tests), source labels the
  mode actually played (urlReady actualFormat; startup-timer test) · gates: cargo build EXIT:0 ·
  cargo 248/248 solo EXIT:0 (sweep flake = waypoint) · vitest 405/405 · e2e 72 pass EXIT:0 ·
  tsc/lint/build EXIT:0
