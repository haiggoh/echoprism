# Third-party notices and attribution

EchoPrism is an independent client and is **not affiliated with, endorsed
by, or connected to YouTube, Google, Apple, any podcast publisher, or any
of the services below**. All product names and trademarks belong to their
respective owners.

## Services used at runtime

- **YouTube content** — accessed through public front-ends and yt-dlp.
  EchoPrism does not proxy, cache, or re-host YouTube content; playback
  requests go to the platform's own delivery.
- **Piped / Invidious instances** — community-run YouTube front-ends the
  user configures (EchoPrism seeds two public instances by default, both
  API-verified before seeding). https://github.com/TeamPiped/Piped and
  https://github.com/iv-org/invidious.
- **yt-dlp** — the local fallback for search and stream resolution.
  https://github.com/yt-dlp/yt-dlp (Unlicense).
- **iTunes Search API** — the podcast directory. Provided by Apple; no key
  required. https://performance-partners.apple.com/search-api.
- **SponsorBlock** — optional sponsor/chapter data, queried by video id.
  https://sponsor.ajay.app (CC BY-NC-SA 4.0 for its database).

## Build-time stack

Tauri 2 (MIT/Apache-2.0), React (MIT), TypeScript (Apache-2.0), sqlx
(MIT/Apache-2.0), Tailwind CSS (MIT), Vitest (MIT), Playwright
(Apache-2.0) — full lists in `package.json` and `src-tauri/Cargo.toml`.

## EchoPrism itself

MIT — see `LICENSE`.
