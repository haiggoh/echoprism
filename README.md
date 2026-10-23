# EchoPrism

A unified video and podcast player: YouTube watching and podcast listening
converge in one app — one library, one queue, smart links pairing the two
streams of the same show. Built with Tauri 2, React and Rust. No account, no
telemetry; search goes through public YouTube front-ends with the local
`yt-dlp` binary as the guaranteed fallback, podcasts through Apple's iTunes
Search API.

EchoPrism is an independent client — not affiliated with YouTube, Apple, or
any podcast publisher. See [docs/PRIVACY.md](docs/PRIVACY.md) for what the
app stores locally and what third-party services see, and
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for attribution.

## Build from source

Requirements: Node 20+, npm, Rust (stable), and optionally `yt-dlp`
(`brew install yt-dlp`) for search.

```sh
scripts/build-from-source.sh
```

The script checks prerequisites, installs the locked dependencies, and
produces:

- `src-tauri/target/release/bundle/macos/EchoPrism.app`
- `src-tauri/target/release/bundle/dmg/EchoPrism_<version>_aarch64.dmg`

Run the app from the bundle, or install the dmg's contents into
`/Applications`.

### First launch (unsigned build)

The build carries no Apple signing identity, so Gatekeeper may block the
first launch: **right-click EchoPrism.app → Open**, or run
`xattr -cr <path to EchoPrism.app>` once.

### Staying up to date

Unsigned builds cannot self-update. Compare your build against the latest
release and rebuild when behind:

```sh
ECHOPIRM_REPO=<owner>/echoprism scripts/check-updates.sh
scripts/build-from-source.sh
```

## Development

```sh
npm install
npm run tauri:dev     # app with hot reload
npm test              # vitest
npm run test:e2e      # Playwright (mock world, no backend needed)
cargo test --lib      # Rust unit tests (in src-tauri)
```

Docs and milestone plans live in `docs/plans/`; the delivery routes are
described in `docs/plans/2026-10-23-4-prep-delivery-routes.md`.

## Status

Pre-release. Known gaps are tracked in the roadmap
(`docs/plans/2026-10-19-release-roadmap.md`).
