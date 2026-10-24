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

## Phase B/C receipts (2026-10-23/24, GLM 5.3 Flash — all committed)

- **Phase A DONE** (`0023ef62`) — the blocker closed: `enclosure_stream_for`
  resolves a podcast episode's own `audio_url` before the extractor (even
  for a video request); F04-H3 drives subscribe→play end to end; waypoint
  `podcast-episodes-cannot-play` done with evidence.
- **Phase B DONE** (`3283f02c`) — Retry wired (recovery proven: first call
  rejects, Retry refetches, error clears); sync toggle hidden; light theme
  MEASURED (`light-theme-contrast.test.ts` parses `html.light` and computes
  WCAG ratios; the first run missed the badge-on-wash pairs the live axe
  scan caught at 4.03/4.12 → fixed to 5.5/5.3). The provider resolves
  'system' through the OS — which flipped the whole e2e suite to light
  (headless prefers light); the suite is pinned dark (authored brand) and
  theme-light.spec.ts covers light explicitly.
- **Phase C DONE** (`d08e74a5`) — local-only capture (Rust panic hook + JS
  error/rejection listeners → bounded 10-record ring, sanitized: no home
  paths, no usernames — tested), opt-in-gated submission via a prefilled
  GitHub issue (no tokens), scheduled triage action. The contract test's
  refusal to find the commands at crate root moved them to
  commands/crash.rs — the convention talking.
- **Live-test pass 1 DONE** (`17720006`) — the four UI findings from the
  owner's first live test (see Early discovery above).
- **Live-test pass 2 DONE** (`16a060b8`) — history records every playback
  (the surface had NO writer before) and Channels rows carry avatars +
  derived home links. Gates at each milestone: cargo 78→81/81, vitest
  193→199/199, tsc clean, Playwright 30/30.

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

## Phase E — play preview on hover (feature, TDD; RESEARCHED 2026-10-23)

**Research findings (primary sources, live):**
- **YouTube's own hover preview is a STORYBOARD SPRITE SHEET, not a video
  stream.** `yt-dlp -F` lists `sb0–sb3` (mhtml sprite formats, 48×27 →
  320×180) for real videos; Piped's `/streams` response — the SAME response
  family the app already parses for playback (1e fixture) — carries
  `previewFrames` (80×45, 160×90 levels with per-level URL lists). Playing a
  real muted stream per hover is NOT how the biggest deployment of this
  pattern does it, and our stream resolution costs 1–8 s + an instance/yt-dlp
  round trip — exactly the churn risk identified in revision 2.
- **Libraries evaluated:** `react-hover-video-player` (npm v10.0.2, GitHub
  Gyanreyer/react-hover-video-player ★100, maintained) manages the muted
  `<video>` hover lifecycle — the right pick ONLY if we played real streams;
  it does nothing about our actual cost (RESOLUTION). `hover-video-player`
  (npm 1.3.0) is a non-React web component — no fit.
  `cj-image-flip-previewer` (★7, TypeScript, updated 2026-10-14) implements
  exactly the sprite-flip interaction ("flip through images by mouse position
  or animate frames on hover") — evaluated and REJECTED for v1: a 7-star
  dependency is a bus-factor risk for a core affordance whose interaction is
  ~80 lines we can own with tests. Revisit if the renderer grows.
- **Live snapshot caveat (2026-10-23):** `pipedapi.ducks.party`'s /streams
  endpoint is currently bot-blocked by YouTube (`LOGIN_REQUIRED` from the
  instance's NewPipe extractor — search still works), so previewFrames came
  back empty live; the committed 2026-10-20 fixture (Rick Astley capture)
  proves the field exists when the instance is healthy. The yt-dlp storyboard
  route (sb formats) is instance-independent and worked live.

**Revised behaviour contract:** hovering an episode card's thumbnail for
~600 ms starts a STORYBOARD preview — sprite frames flipped by mouse
position (the cj-image-flip interaction, owned) or auto-advanced; leaving
cancels and destroys the element. Video-shaped episodes only (with
`video_id`); podcast-shaped episodes get NO preview — nothing invented for
them. The preview never hijacks the card's click (D2 unchanged) and is
`aria-hidden` (enhancement; play remains the action).

**Design decisions (recorded):**
- **Cost model, bounded:** preview SOURCE resolution is one call per NEW
  hovered id (LRU ~8, keyed on video id): Piped `previewFrames` when an
  instance is healthy, else the yt-dlp `sb` storyboard format (guaranteed
  path; one invocation per id, cached). Sprite fetches are static i.ytimg
  CDN assets (~100–300 KB, small). NO stream resolution, NO video decode,
  NO media element for the preview.
- **Modularity — the owner's unplug requirement:** the feature lives behind
  ONE import surface: `src/components/ui/EpisodePreview.tsx` +
  `src/hooks/useHoverPreview.ts`, imported ONLY by EpisodeCard, with a
  single `PREVIEW_ENABLED` module constant; the Rust side is one isolated
  helper (`preview_frames_for(video_id)`) in the extractor. Unplugging =
  flip the constant (or delete two files + one import) — call sites never
  see the internals. If the perf contract is ever violated in real use, the
  feature comes out whole; the contract tests below define "violated".
- **Reduced motion + touch:** `prefers-reduced-motion: reduce` and
  non-hover-capable pointers disable previews entirely (2b's a11y bar).
- **Mock world mirrors it:** a tiny fixture sprite (checked-in PNG grid +
  a `preview_frames` mock command) makes the interaction e2e-testable
  headless without any network.

- **TDD:** `useHoverPreview` hook (delay, cancel-mid-delay, LRU hit/evict —
  pure logic tested directly) + `EpisodePreview` component tests (frame flip
  by mouse position from the sprite spec, aria-hidden, destroy on leave,
  absent for podcast rows / reduced motion / PREVIEW_ENABLED=false — the
  UNPLUG assertion is itself a test) + Rust tests for
  `preview_frames_for` (Piped parse from the committed fixture with
  previewFrames; sb-format fallback parse from a live yt-dlp capture).
- **Mutations:** remove leave-cancel → red; break LRU bound → red; ignore
  the reduced-motion gate → red; flip PREVIEW_ENABLED=false → preview
  absent (the unplug test). Restores cmp-verified, green after.

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

## Early discovery (owner live test, 2026-10-23 — the Phase G budget firing ahead of schedule)

The owner's live test found four UI items, fixed in commit `17720006`
(frontend-design pass within the existing brand): the podcast filter glyph
became a headphones silhouette; the placeholder bell (hardcoded "3") and
the account-style avatar are GONE — episode notifications are recorded as
a real feature needing seen-state (waypoint `episode-notifications-a-real`);
the third wide brand mark left the header; and the playbar architecture is
settled: ONE engine, TWO control surfaces — the MiniPlayer is a single bar
with an integrated keyboard-operable seek strip (its hover-expanded
duplicate panel — the owner's "second queue bar" — is gone) and its expand
control navigates to the full player screen. Bonus find from the same
pass: the header search input was decoration; it now routes to
/search?q= which the Search screen prefills and runs.

## Phase D/E/F/G/H receipts (2026-10-24, GLM 5.3 Flash)

- **Phase D DONE** (`090b28e9`) — docs/PRIVACY.md (local-first, what each
  service sees, the opt-in crash flow, deletion), THIRD-PARTY-NOTICES.md,
  the non-affiliation statement in README + notices. MIT licence existed.
- **Phase E DONE** (`1316c578`) — hover storyboard previews, the researched
  design (sprite, not stream; see the research findings in the phase
  body). One serde bug (a missing camelCase rename silently emptying the
  levels) was caught by the committed-fixture test; the level-choice
  mutation red; the unplug switch is a TESTED assertion.
- **Phase F DONE** (`06f9ee1b`, `313e5905`) — 8 deterministic screenshots
  from the mock world, README gallery, static landing page (Pages
  enablement = owner toggle). A capture utility running inside the plain
  suite overwrote committed artifacts — it is now opt-in
  (CAPTURE_SCREENSHOTS=1) and the artifacts restored.
- **Live-test pass 3 DONE** (`53bef2cd`) — the owner's history finding,
  one layer deeper than the missing writer: rows rendered raw uuids. The
  list command hydrates titles/thumbnails; rows link to the player; F07-H1
  proves play → History end to end.
- **Phase G DONE** — the full sweep green: cargo 0 warnings, 84/84 + 6/6
  live smokes, tsc clean, vitest 204/204, Playwright 39/39 (all flows
  incl. the new history e2e; the flow-matrix gap it exposed was fixed
  first). Freeze held: the only post-green change was the screenshot
  utility's opt-in fix (a test-found defect, with its own receipt).
- **Phase H DONE** — `gh repo create haiggoh/echoprism --public --source .
  --remote origin --push`; verified: remote HEAD == local (313e5905),
  release.yml present on the remote, ZERO tags (the owner's first `v*`
  tag is the release trigger), visibility PUBLIC. **The run's authorized
  boundary — reached and stopped at.**
- **Phase I (owner)** — the verification checklist stands; the Homebrew
  cask fill-in and the Pages toggle are the two remaining owner actions
  after the first tagged release.

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
