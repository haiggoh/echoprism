# Execution Plan — 4-prep: name check + delivery routes prepared (handoff item 5)

_Authoring date: 2026-10-23 (GLM 5.3 Flash free session). Parent:
`docs/plans/2026-10-22-handoff-glm-flash.md` item 5 → roadmap step 4
(4b, 4c, 4d, 4e). Standing rules as 2e–2h. **Everything prepared, nothing
pushed/tagged/published** — the repo has NO git remote yet; that setup is
the owner's._

## 4b — name check (done 2026-10-23, primary sources)

| Surface | Method (source of truth) | Result |
|---|---|---|
| GitHub global namespace | `api.github.com/users/echoprism` → 200 | TAKEN by another account — irrelevant to `github.com/<owner>/echoprism` (namespaces are per-user) |
| GitHub repos named echoprism | repo search | 1 repo total (`notgz800-netizen/echoprism`, ★0) |
| npm | `registry.npmjs.org/echoprism` → 404 | **FREE** |
| Mac App Store | iTunes Search API, entity=macSoftware | No "EchoPrism" (only fuzzy "echo" apps) — **appears free** |
| iOS App Store | iTunes Search API, entity=software | No "EchoPrism" — **appears free**; exact availability needs an App Store Connect account |
| Google Play | HTML search (no API) | Inconclusive from scraping — owner-confirms in Play Console |
| EchoPrism.com | (roadmap, already known) | Taken |

Full details: `docs/name-check-2026-10-23.md`.

## 4c/4d/4e — the three routes, prepared

1. **Build from source** — `scripts/build-from-source.sh`: prereq checks
   (node, npm, cargo, rustc; yt-dlp optional), `npm ci`, `npm run
   tauri:build`, prints artifact paths + the unsigned Gatekeeper note.
   `--help` documents everything; unknown flags exit 2 BEFORE any work.
   VALIDATED by an actual release build on this machine (receipt below), not
   by reading it.
2. **Homebrew cask (template)** — `packaging/homebrew/echoprism.rb` with
   placeholder url/sha256 and the fill-in recipe in comments; the owner's tap
   repo lives outside this repo (post-release step).
3. **GitHub Releases workflow** — `.github/workflows/release.yml`, triggered
   ONLY by `v*` tag pushes (inert on master — committing it publishes
   nothing). macOS runner, `npm ci` + `npm run tauri:build`, uploads the dmg
   and creates the release with the Gatekeeper note in the body.
4. **4d updates** — `scripts/check-updates.sh`: compares the local
   `tauri.conf.json` version against the latest GitHub release tag of
   `$ECHOPIRM_REPO` (required, since no remote exists yet); tells the user to
   re-run the build script when behind. No auto-updater (unsigned builds
   cannot self-update — the 4c decision).
5. **README** — minimal build-from-source + Gatekeeper note + docs pointers
   (the full launch materials are 4h, out of scope).

## Verification

- `bash -n` every script; `--help` RUN for each (never grepped).
- The release build itself runs once here (`npm run tauri:build`) and its
  artifact paths are the receipt the build script points at.
- Workflow: YAML-parsed; can only be fully proven by the owner's first tag
  push (documented as such — no remote, no tag, per the standing rule).

## Non-goals

4a (licence/privacy/attribution — separate milestone), 4f (crash reporting),
4g/4h (beta + launch materials), universal (x86_64) builds, the auto-updater
(needs signing), any actual push/tag/release.
