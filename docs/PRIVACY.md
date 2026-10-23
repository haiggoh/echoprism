# EchoPrism privacy

EchoPrism is a local application. There is no account, no sign-in, no
telemetry, and no analytics of any kind. Nothing about your usage leaves
your machine unless you explicitly take an action described below.

## What stays on your machine

- Your library: subscriptions, episodes, queue, playback positions, history,
  play-mode rules and settings live in a local SQLite database at
  `~/Library/Application Support/app.echoprism/`.
- Crash captures (if a panic or page error occurs) are written to a local
  file in the same directory, capped at the ten most recent, and never sent
  anywhere by the app. You can view and delete them in Settings → Crash
  reports.

## What third parties see when you use the app

Searching and playing necessarily involve third-party services. What they
see is limited to the request itself:

- **Search backends (Piped/Invidious instances, yt-dlp):** an instance you
  query sees your search term and your IP address, as any web request does.
  yt-dlp talks to YouTube directly. EchoPrism adds nothing to these
  requests beyond the query.
- **iTunes Search API (podcast directory):** Apple sees the podcast search
  term and your IP address.
- **Media streams:** playing a video or podcast fetches bytes from the
  platform's own CDN — the same request your browser would make.
- **SponsorBlock (if a video carries chapter/sponsor data):** SponsorBlock
  sees the video id being queried.

EchoPrism does not inject tracking, does not fingerprint, and does not read
any other page or service.

## Crash reports — strictly opt-in

Crash reporting is off by default. Capture is always local-only. If you opt
in (Settings → Crash reports), EchoPrism helps you file a GitHub issue in
your own browser with a STRIPPED report: absolute paths under your home
directory collapse to `~`, other absolute paths are reduced to file names,
and no database contents are included. A scheduled GitHub Action groups
identical crashes by signature; the maintainer reads the resulting issues,
never raw reports, and there is no automatic upload of any kind.

## Deleting your data

Settings → Crash reports → Clear reports removes local captures. Clearing
history (History screen) removes your play history. Deleting the
`app.echoprism` application-support folder removes everything the app
stores.
