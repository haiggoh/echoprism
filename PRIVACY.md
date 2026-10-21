# EchoPrism Privacy

_Today's truth, not aspirations. This document describes what the released
app does; if a future version adds anything here that is not yet true, this
file changes with it._

## The short version

EchoPrism has no accounts, no analytics, and no telemetry. Your data stays
on your machine.

## What is stored, and where

Everything the app knows lives in a local SQLite database inside your user
application-data directory (`echoprism.db`): your subscriptions, your queue
and play-mode rules, playback positions, search results you have looked at,
and your settings. It never leaves your machine unless you copy it.

Downloads you start are stored where you chose (or the app's download
directory) and nowhere else.

## What leaves your machine, and to where

The app is a client: to do its job it must talk to the services that host
the content it plays.

- **Video search and playback** go to the Piped/Invidious instance or
  instances **you** configure (one default instance ships seeded; you can
  add, pin, or replace them in Settings → Instances). Your search queries
  and playback requests go to those instances, under their privacy terms —
  not to EchoPrism.
- **When no instance can serve a request**, the app calls the locally
  installed `yt-dlp` binary, which contacts YouTube directly.
- **Podcast discovery** queries Apple's public iTunes Search API with the
  search terms you type. Subscribing fetches the publisher's RSS feed
  directly from the publisher's host.
- **Sponsor segments** (when the SponsorBlock integration is enabled) are
  fetched from the SponsorBlock API keyed by video id — no account, no
  personal identifiers.

The app itself sends no identifiers, no crash reports, no usage statistics,
and no keys to anyone. It does not phone home.

## What the developers can see

Nothing. There is no server operated by the EchoPrism developers and no
collection endpoint. If crash reporting is ever introduced, it will be
opt-in, stripped of personal data, and landed as GitHub issues you can read;
this document will be updated first.

## Your control

- Delete the app's data by deleting its application-data directory (or use
  the in-app settings where provided).
- Every network destination except public search APIs is user-configurable.
- The app is open source — this behaviour can be verified in the source, not
  taken on faith.
