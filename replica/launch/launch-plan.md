# EchoPrism launch plan (document only — nothing published, owner-gated)

Written 2026-11-02 by the parity-audit batch 3 (plan Task 7, "documents only").
Inputs: `brand.json` (name EchoPrism; avoid YouTube/Google/YT/yt as brand
references), `docs/landing/` (existing landing page), `replica/parity.md`
(2026-11-02 re-audit: feature parity 100% of scored rows, 5/5 must-haves).

## Positioning

A local-first desktop media app: one library and one queue for YouTube videos
and podcast episodes, with smart cross-stream linking (the same story on both
streams is one tap apart) and a single global play bar. Differentiators vs a
plain player: smart episode linking, per-title-family play modes, SponsorBlock,
playlists, retention-managed storage, Now Playing / media keys.

## Rebrand sweep status (replica-brand, run 2026-11-02)

`python3 .claude/skills/replica-brand/sweep.py . --config brand.json` ran with
exit 0; raw hit count 21,321 — but the bulk are build artifacts
(`src-tauri/target/**`, incl. `.sqlx` cache copies) and code identifiers
(`youtube_video_id`, extractor API domains), NOT user-facing brand text. Before
any public launch: re-run the sweep excluding `src-tauri/target/` and code
identifiers, and review only user-visible strings (README, landing page,
app name in `tauri.conf.json`, error messages).

## Store/listing notes

- macOS app distributed as a signed dmg via the release workflow (tag `v*`);
  App Store submission is a separate owner decision (sandboxing review) —
  not started.
- No pricing, no testimonials, no invented proof — the app is free/local-first;
  any listing must say so.

## Launch checklist (NOT executed)

- [ ] Rebrand sweep clean on user-visible strings (excluding target/ + identifiers)
- [ ] Landing page (`docs/landing/`) published via Pages (owner-gated, see waypoint echoprism-release-roadmap)
- [ ] Homebrew cask filled from the release dmg (owner-gated)
- [ ] First public release tag pushed (v0.1.2 cut 2026-11-02 — see Task 8)
- [ ] Phase I owner click-through in the real app (waypoint echoprism-phase-i-owner)
