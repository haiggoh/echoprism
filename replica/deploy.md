# EchoPrism deploy preflight (document only — nothing deployed, owner-gated)

Written 2026-11-02 by the parity-audit batch 3 (plan Task 7, "documents only").
Per replica-deploy's rule: nothing goes live without the user's go.

## Preflight results (2026-11-02, branch fix/parity-audit-2026-11-02 @ 041cdb6e)

- [x] Unit gates: vitest 300+/300+, cargo test 160 passed, build zero warnings,
      tsc clean, eslint `--max-warnings 0` clean (numbers as of Task 5-6 commits;
      re-verified at ship time in Task 8)
- [x] e2e: Playwright 33 passed / 0 failed / 8 skipped (capture-only), warm server
      (cold vite start exceeds the 30 s goto timeout — see test-plan.md)
- [x] Parity: check_parity.py → 100% scored rows, 5/5 must-haves, SHIPPABLE
      (replica/parity.md, 2026-11-02 re-audit)
- [x] Rebrand sweep executed; user-visible strings need a final review pass
      (raw hits are dominated by build artifacts + code identifiers)
- [x] Release pipeline: `.github/workflows/release.yml` builds the macOS dmg
      on `v*` tags; v0.1.1 tagged 2026-11-01, v0.1.2 cut with this batch
- [ ] Homebrew cask filled from the produced dmg — **owner-gated**
- [ ] Pages enabled for docs/landing — **owner-gated**
- [ ] Phase I in-app click-through — **owner: you, in tauri:dev** (waypoint echoprism-phase-i-owner)
- [ ] App Store / notarization review — not started, separate decision

## Notes

- Distribution today: direct dmg from GitHub releases (tag-triggered CI) +
  Homebrew tap (haiggoh/homebrew-tap) once the cask is filled.
- No backend service to deploy: the app is local-first (SQLite on-device);
  the only server-side surface is the GitHub release workflow + Pages.
