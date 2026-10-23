# Execution Plan — first-release completion run (post-4-prep)

_Authoring date: 2026-10-23 (GLM 5.3 Flash free session, planning pass).
Parent: `docs/plans/2026-10-19-release-roadmap.md`; supersedes nothing — it
SEQUENCES what the owner approved on 2026-10-23 (answers recorded in
Decisions). Standing rules inherited from
`docs/plans/2026-10-22-handoff-glm-flash.md`: TDD (red for the right
reason), `/check-code`, `cmp`-guarded mutation checks, per-milestone Gemini
review, path-staged commits on `master`, model trailer (verify the proxy
config before the first commit of each session).

## Decisions (owner, 2026-10-23 — verbatim answers)

1. **Release gate:** "Create public repo + push master" — gh
   (authenticated as haiggoh) creates `haiggoh/echoprism` PUBLIC, master is
   pushed, **NO tag**. The release workflow fires only when the owner
   pushes a `v*` tag themselves.
2. **Crash reporting:** "Opt-in crash reporting now" — the roadmap
   decision-3 design ships in this run (opt-in, stripped of personal data,
   a GitHub Action dedupes by stack signature and files labelled issues;
   the owner reads GitHub issues only).
3. **Gap fixes:** podcast playback fix + dead Retry button + hide the
   no-op sync toggle + light theme, **plus an explicit allowance for
   anything that comes up during final testing before release**.
4. **Version:** keep **0.1.0** across all surfaces.

## Known issues and missing parts (complete inventory, 2026-10-23)

| # | Item | Source | Disposition |
|---|---|---|---|
| 1 | Podcast episodes cannot play in the real backend (`stream_episode` ignores `audio_url`, yt-dlp gets the RSS guid) | waypoint `podcast-episodes-cannot-play`, 2e discovery | Phase A (blocker) |
| 2 | Dead Retry button on SearchScreen (`onClick={() => {}}`) | 2c relic, made visible by 2f | Phase B |
| 3 | Cross-device sync toggle persists a field nothing reads | 2a known gap | Phase B (hide) |
| 4 | Light theme does not exist but Settings offers it | 2a | Phase B (build) |
| 5 | 4f crash reporting | roadmap 4f + decision 3 | Phase C |
| 6 | 4a remainder: privacy policy, API attribution, non-affiliation statement (MIT licence already exists) | roadmap 4a | Phase D |
| 7 | 4g: full user-flow test pass; final-testing discoveries | roadmap 4g + owner allowance | Phase E |
| 8 | GitHub remote + push (workflow inert without it) | 4-prep | Phase F |
| 9 | Owner-verify list (sound, audio-only, Now Playing, media keys, scrubber, ⌘←/⌘→, window restore, in-app podcast flow) | 2d/2e receipts | Phase G (owner) |
| 10 | Play preview on hover; 4h launch materials; light-theme polish iterations | owner: after first release | out of scope |

## Authority matrix

| Operation | Status | Gate |
|---|---|---|
| Edit src/, src-tauri/, docs/ | allowed (master, staged by path) | TDD + gates per milestone |
| Commit milestones | allowed | trailers: harness + running model (verify proxy config per session) |
| `gh repo create haiggoh/echoprism --public` + `git push` master | **allowed (owner answer 1)** — EXACTLY once, at Phase F | tree clean, all gates green, secrets scan clean |
| Push a tag / publish a release | **PROHIBITED** | owner's own `v*` tag is the trigger |
| Local model dispatch for bulk steps | preferred where checkable (see Offload) | verify delegated output |

Offload (plan level): TDD implementation stays interactive on this lane;
the per-milestone Gemini review stays the designated offload (standing rule
4); Phase B's light-theme palette draft could dispatch to a local operator
ROLE — but its acceptance is contrast-measured against 2a's tokens, so the
dispatch is optional, not required.

## Phase A — podcast playback (TDD, blocker)

**Behaviour contract:** an episode with a non-empty `audio_url` and no
`video_id` (subscribed-podcast shape) resolves to its enclosure —
`StreamInfo { url: audio_url, format: "audio" }` — whether the requested
format is `audio` (obvious) or `video` (no video stream exists; playing the
enclosure beats an error). Episodes WITH a `video_id` are unchanged (the
2d HLS/m4a path).

- **RED:** Rust test in `commands/episodes.rs` — `stream_episode`'s seam
  extracted if needed (it takes States; mirror the 2f pattern: extract the
  decision into a testable pure fn
  `stream_info_for_episode(episode, requested_format) -> Option<StreamInfo>`
  consulted BEFORE the extractor path, unit-tested with the podcast and
  video shapes). Mock (`src/mocks/router.ts`) aligned: same semantics
  (currently format=audio returns `audio_url` ✓; video-request on a
  podcast-shaped episode currently THROWS — must return the enclosure after
  the fix).
- **Tests:** Rust unit (pure fn, both shapes + audio_url-empty edge);
  vitest mock semantics; e2e F04 extension: subscribe in the directory →
  click an episode row → the engine's `<audio>`/`<video>` gets the
  enclosure src (mock world).
- **Mutations:** drop the audio_url branch → red; restore, cmp, green.
- **Receipts:** gates + review; waypoint `podcast-episodes-cannot-play`
  closed with evidence.

## Phase B — the three gap fixes (TDD each, smallest first)

1. **Retry button:** `SearchScreen`'s error branch wires
   `onClick` → `queryClient.invalidateQueries({ queryKey: ['search', query,
   filter] })`. Test: render error state (mock rejects once), click Retry,
   results render. Mutation: unwire → red.
2. **Sync toggle:** remove the toggle from `SettingsScreen` (a control for
   nothing is dishonest UI; the field stays in the schema — no data
   migration). Test: the Settings axe/renders test asserts the control is
   ABSENT; note in the commit why (no-hidden-changes: visible-state change
   recorded in the roadmap + commit message).
3. **Light theme:** build the `light` palette as 2a-style CSS tokens
   (contrast-measured — every pair the dark theme asserts in
   `theme-truthfulness.test.tsx` gets a light equivalent at ≥ AA), the
   theme hook applies the class, the theme test extended. This is the
   largest Phase-B item; if it exceeds a sane slice it splits into its own
   milestone — the plan prefers honest splitting over silent over-run.

## Phase C — 4f opt-in crash reporting

**Design decision (recorded, with the alternative):** no embedded upload
token (any token shipped in a public app is extractable). The opted-in flow
captures crashes LOCALLY (Rust panic hook + JS `window.onerror`/unhandled
rejection → a local ring file), shows the user the stripped report, and
submission is the user's own action: open a prefilled GitHub issue
(`haiggoh/echoprism` new-issue URL with `crash: <signature>` title + the
stripped body). A scheduled Action (`crash-triage.yml`) labels/dedupes
`crash:` issues by signature. This satisfies decision 3's contract (opt-in,
stripped, Action dedupes and files/labels, owner reads issues only) with
zero server and zero secrets. Alternative rejected for v1: hosted collector
(account + privacy surface for zero v1 benefit).

- **Tasks:** capture hook (Rust `std::panic::set_hook` → app-data ring
  file; JS hook → same via a command), opt-in toggle (default OFF, honest
  Settings copy), report builder (stack signature = top frames hash; strip
  paths/user data), the Action workflow.
- **TDD:** signature derivation (pure fn: same crash → same signature,
  different → different; user paths stripped), capture gate (off → no
  write), report builder strips `~` paths. The Action's dedupe is shell —
  bash -n + a dry-run against fixture issues.
- **Privacy review:** the stripped report must contain no home paths, no
  URLs with tokens, no DB contents — asserted by a test over the builder.

## Phase D — 4a remainder (docs)

- `docs/PRIVACY.md`: no telemetry, no accounts, crash reports opt-in-only
  (Phase C's flow, what is stripped), what search backends see (a queried
  instance sees the query string — honest), local data locations.
- Attribution: README section + `THIRD-PARTY-NOTICES.md` (SponsorBlock,
  Piped/Invidious, iTunes Search API, yt-dlp, Tauri/React/sqlx).
- Non-affiliation statement (not affiliated with YouTube/Apple/podcast
  publishers) in README + the release body template.
- MIT licence exists ✓ — verify the year/holder line is what the owner
  wants visible ("EchoPrism contributors" is fine; note only).

## Phase E — 4g final testing + the discovery budget

- Playwright: extend specs to every user flow incl. the directory
  subscribe→play flow (Phase A) and the crash-report opt-in flow; axe stays
  15+ scans green.
- Full gates; then a REAL shell pass is owner-verify (Phase G).
- **Discovery budget (owner answer 3):** findings from this phase are
  triaged as: crash/blocker → fix in-run (TDD); cosmetic → waypoint + defer;
  anything needing owner input → AskUserQuestion at the seam.

## Phase F — delivery activation (owner answer 1; EXACTLY once)

1. Gates all green; `redact-secret.py --scan-only` over the touched set;
   tree clean.
2. `gh repo create haiggoh/echoprism --public --source . --remote origin
   --push` (or explicit `git remote add` + `git push -u origin master`).
3. Verify: remote HEAD == local master; `.github/workflows/release.yml`
   present on the remote; NO tag pushed (`git tag` empty on the remote).
4. STOP. The owner's first `v*` tag fires the release; the cask fill-in
   recipe (packaging/homebrew/echoprism.rb header) applies to that dmg.

## Phase G — owner verification (handoff checklist, cannot be automated)

Sound; audio-only mode; Now Playing panel; ⏯/⏭/⏮ keys; the scrubber;
⌘←/⌘→ in the search box; window restore after close → Dock → ⌘Q; the
in-app podcast flow (search "Vergecast" → directory card + videos →
Subscribe → play an episode — now expected to WORK after Phase A);
thumbnails on new searches.

## Adversarial risks (pre-written)

- **Shortcut:** "fix" podcast playback by making the mock match the real
  behaviour instead of the reverse → consequence: live-and-inert again →
  rule: the Rust test drives the REAL command seam; the mock only mirrors.
- **Shortcut:** crash report "stripped" by regex hope → consequence: a home
  path in a public issue → rule: the builder test asserts the absence of
  `$HOME`, usernames, and feed/DB contents; `--explain-filtered` scan on
  the builder's output fixture.
- **Shortcut:** light theme by inverting a filter → consequence: contrast
  failures invisible in dark-biased tests → rule: every token pair asserted
  numerically (2a's pattern), not visually.
- **Shortcut:** push before Phase E's discoveries are fixed → consequence:
  a public repo whose HEAD already needs fixes → rule: Phase F runs LAST
  and re-checks the tree.
- Cannot be tested here: the real GitHub Action run (needs the first real
  crash issue) — documented as owner-verify.

## Non-goals

Play preview on hover, 4h launch materials/landing page, iOS (decision 1),
auto-updater (needs signing), universal x86_64 builds, implementing
cross-device sync (the toggle is hidden, not built), pushing a tag.
