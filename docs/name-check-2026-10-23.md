# EchoPrism — name availability check (4b), 2026-10-23

All checks ran against primary sources (the endpoints themselves), not
search snippets. Roadmap premise carried in: **EchoPrism.com is taken.**

| Surface | Method | Result | Verdict |
|---|---|---|---|
| GitHub global namespace | `GET api.github.com/users/echoprism` → 200 | another account holds the bare `echoprism` name | irrelevant to the owner's own namespace: `github.com/<owner>/echoprism` is available unless the owner already uses that repo name locally (this repo has **no remote yet**) |
| GitHub repos by name | repo search `echoprism in:name` | exactly 1 (`notgz800-netizen/echoprism`, 0 stars) | no meaningful collision |
| npm | `GET registry.npmjs.org/echoprism` → 404 | package name free | FREE |
| Mac App Store | iTunes Search API `entity=macSoftware` | zero exact matches (fuzzy "echo" apps only) | appears free |
| iOS App Store | iTunes Search API `entity=software` | zero exact matches | appears free; **exact** availability is only knowable in App Store Connect (owner account) |
| Google Play | HTML search scrape (no public API) | inconclusive — page echoes the term | owner confirms in Play Console if Android ever happens (step 3 territory) |

## Owner actions this cannot do for you

1. GitHub: create the remote repo (name free in your namespace) and push —
   the release workflow (`.github/workflows/release.yml`) is already
   committed and fires on your first `v*` tag.
2. App Store Connect / Play Console: the definitive reservation check, only
   if/when those distribution routes are actually taken (Mac App Store needs
   the paid Apple membership — decision 1 defers it).

## Related but separate

- `app.echoprism` is the Tauri **bundle identifier** (not a name claim); it
  is only used locally and for the app-support directory. Changing it later
  would orphan window-state and DB paths on existing installs — decide
  BEFORE the first release if a different identifier is ever wanted.
- 4a (licence, privacy policy, API attribution) is its own milestone and not
  covered here.
