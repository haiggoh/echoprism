# Execution Plan — first-release completion run (post-4-prep)

_Authoring date: 2026-10-23 (GLM 5.3 Flash free session, planning pass);
**REVISION 2 same day**: the owner pulled everything previously parked as
post-release INTO this run — "nothing we already planned is post-release, I
want to go out to release with the best possible version, we're not in a
rush so let's finish everything we have planned and do a proper final test
run before release." Parent: `docs/plans/2026-10-19-release-roadmap.md`.
Standing rules inherited from
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
5. **REVISION 2:** nothing is post-release any more — play preview on
   hover and 4h launch materials join this run, and a **proper final test
   run** gates the delivery. Quality bar: "the best possible version";
   explicitly not in a rush.

## Known issues and missing parts (complete inventory, 2026-10-23)

| # | Item | Source | Disposition |
|---|---|---|---|
| 1 | Podcast episodes cannot play in the real backend (`stream_episode` ignores `audio_url`, yt-dlp gets the RSS guid) | waypoint `podcast-episodes-cannot-play`, 2e discovery | Phase A (blocker) |
| 2 | Dead Retry button on SearchScreen (`onClick={() => {}}`) | 2c relic, made visible by 2f | Phase B |
| 3 | Cross-device sync toggle persists a field nothing reads | 2a known gap | Phase B (hide) |
| 4 | Light theme does not exist but Settings offers it | 2a | Phase B (build) |
| 5 | 4f crash reporting | roadmap 4f + decision 3 | Phase C |
| 6 | 4a remainder: privacy policy, API attribution, non-affiliation statement (MIT licence already exists) | roadmap 4a | Phase D |
| 7 | 4g: full user-flow test pass; final-testing discoveries | roadmap 4g + owner allowance | Phase G |
| 8 | GitHub remote + push (workflow inert without it) | 4-prep | Phase H |
| 9 | Owner-verify list (sound, audio-only, Now Playing, media keys, scrubber, ⌘←/⌘→, window restore, in-app podcast flow) | 2d/2e receipts | Phase I (owner) |
| 10 | Play preview on hover (YouTube-style muted preview) | owner 2026-10-22, REVISED into scope 2026-10-23 | Phase E |
| 11 | 4h launch materials: final README, screenshots, landing page | roadmap 4h, REVISED into scope 2026-10-23 | Phase F |
| 12 | Proper final test run before release (every flow, full gates, freeze rule) | owner revision 2 | Phase G |

## Authority matrix

| Operation | Status | Gate |
|---|---|---|
| Edit src/, src-tauri/, docs/ | allowed (master, staged by path) | TDD + gates per milestone |
| Commit milestones | allowed | trailers: harness + running model (verify proxy config per session) |
| `gh repo create haiggoh/echoprism --public` + `git push` master | **allowed (owner answer 1)** — EXACTLY once, at Phase H | tree clean, Phase G green, secrets scan clean |
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

## Phase E — play preview on hover (feature, TDD)

**Behaviour contract:** hovering an episode card's thumbnail (Feed, Search,
directory rows) for ~600 ms starts a MUTED inline preview; leaving cancels
and destroys it. Video-shaped episodes (with `video_id`) resolve a stream
through the existing `stream_episode` path; podcast-shaped episodes
(audio-only) get NO preview — nothing dishonest is invented for them. The
preview never hijacks the card's click (D2 semantics unchanged) and is
`aria-hidden` (it is an enhancement; play remains the action).

**Design decisions (recorded):**
- **Resolution cost is bounded**: one resolve per preview, an LRU cache
  (~8 entries) so re-hovers reuse the resolved URL, and a cancel that
  destroys the element (no hidden network churn after leave). The 2g fix is
  what makes instance resolution cheap enough for this.
- **Reduced motion honoured**: `prefers-reduced-motion: reduce` disables
  previews entirely (2b's a11y bar).
- **Mock world mirrors it**: the existing `.webm` fixtures are the preview
  sources, so the behaviour is e2e-testable headless.

- **TDD:** a `useHoverPreview` hook (delay, cancel, LRU — pure logic
  tested directly: timer fires only after the delay, leave cancels
  mid-delay, cache hit skips resolve, cache evicts beyond 8) + component
  wiring tests (video element appears muted with the resolved src,
  aria-hidden, removed on leave, absent for podcast-shaped episodes and
  under reduced motion). e2e: hover → muted video with mock src visible.
- **Mutations:** remove the leave-cancel → red (element lingers); break
  the LRU bound → red; restore, cmp, green.

## Phase F — 4h launch materials

- **Screenshots** — deterministic, from the mock-world dev server via a
  small Playwright capture script (repeatable, no hand-cropping): feed,
  search with a directory hit, player, queue, settings, smart links →
  `docs/screenshots/`.
- **README final polish** — feature overview with the screenshots, the
  three install routes (build-from-source, Homebrew cask after the first
  release, GitHub Releases), Gatekeeper note, privacy summary linking
  `docs/PRIVACY.md`, attribution pointer.
- **Landing page** — `docs/landing/index.html`: a single static page (name,
  one-liner, screenshots, install, privacy, non-affiliation). GitHub Pages
  ENABLING is a repo-settings toggle = owner action, recorded as such; the
  content ships in the repo so Pages is a two-click flip later.
- **Non-goals guard:** no fake screenshots of unbuilt UI; every image is
  captured from the real app.

## Phase G — the proper final test run (gates the delivery)

- **Flow matrix first:** enumerate EVERY user flow (onboarding, feed,
  search incl. directory + subscribe, video playback, podcast playback
  [post-Phase-A], queue + mini player, smart links, settings incl. theme +
  crash opt-in, history, downloads, channels, keyboard nav, window
  lifecycle) and check each against the existing e2e specs — gaps become
  new specs before anything else moves.
- **Full gates:** cargo (zero warnings maintained) + all 6 live smokes,
  vitest, tsc, Playwright, axe scans on every route.
- **The discovery budget (owner answer 3, still open):** findings triage
  as crash/blocker → fix in-run (TDD); cosmetic → fix in-run too (the
  owner's revision asks for the best possible version — no deferral unless
  it needs owner input, which goes to AskUserQuestion at the seam).
- **FREEZE RULE:** after Phase G passes, the only changes before Phase H
  are test-found fixes with their own TDD receipts; the matrix re-runs on
  any fix.

## Phase H — delivery activation (owner answer 1; EXACTLY once)

1. Phase G green + freeze honoured; `redact-secret.py --scan-only` over the
   touched set; tree clean.
2. `gh repo create haiggoh/echoprism --public --source . --remote origin
   --push` (or explicit `git remote add` + `git push -u origin master`).
3. Verify: remote HEAD == local master; `.github/workflows/release.yml`
   present on the remote; NO tag pushed (`git tag` empty on the remote).
4. STOP. The owner's first `v*` tag fires the release; the cask fill-in
   recipe (packaging/homebrew/echoprism.rb header) applies to that dmg.

## Phase I — owner verification (handoff checklist, cannot be automated)

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
- **Shortcut:** push before Phase G's discoveries are fixed → consequence:
  a public repo whose HEAD already needs fixes → rule: Phase H runs LAST
  and re-checks the tree.
- **Shortcut (hover preview):** resolve on EVERY hover without cache or
  cancel → consequence: hidden stream-resolution churn per mouse pass, the
  instance tier hammered → rule: the LRU + cancel tests are the contract;
  e2e asserts a single resolve per episode per hover session.
- Cannot be tested here: the real GitHub Action run (needs the first real
  crash issue) — documented as owner-verify.

## Non-goals

iOS (decision 1),
auto-updater (needs signing), universal x86_64 builds, implementing
cross-device sync (the toggle is hidden, not built), pushing a tag.
