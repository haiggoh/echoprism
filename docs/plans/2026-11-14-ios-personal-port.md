# iOS personal port (v1.1) — sideload via free personal provisioning

- **Date:** 2026-11-14
- **Status:** PLANNED — unblocked by owner decision 4 (2026-11-12): iOS runs via the
  free personal team on the owner's own devices, 7-day expiry accepted, re-sign scripted
  to one command. No Apple Developer membership, no TestFlight, no App Store — which also
  retires roadmap item 3d's store-rejection risk entirely (there is no store in this route).

## Prerequisites (verified on this Mac 2026-11-14)

- Xcode 27.2 + iOS SDK 27.2 present (`xcodebuild -version`, `xcrun --sdk iphoneos --show-sdk-version`)
- Owner's Apple ID (free personal team) + the target iPhone registered to it
- Tauri 2 iOS support (`tauri ios build`), app id `app.echoprism`

## Work items (from roadmap step 3)

1. **Build + sign + install script** — `scripts/ios-build-install.sh`: `tauri ios build`,
   sign with the personal team (`codesign`/`xcodebuild -exportArchive` or the free-provisioning
   flow), install to the connected device. The build is UNSIGNED-by-store but personal-team-signed,
   so Gatekeeper is not in play on-device.
2. **The 7-day re-sign ritual as one command** — `scripts/ios-resign.sh`: re-sign + reinstall
   without rebuilding when only the provisioning profile expired. A weekly reminder via launchd
   (never cron) is optional sugar; the script alone satisfies the ritual.
3. **3b layout**: bottom tab bar instead of the sidebar, ≥44pt touch targets, notch/home-bar
   insets, replacements for every hover-only interaction (hover previews → tap-to-preview).
4. **3c playback**: background audio continuation, lock-screen controls (Media Session API
   already drives the macOS one), picture-in-picture for video.
5. **Smoke on the real device**: search → subscribe → play (YouTube + podcast), audio-only toggle,
   queue, background-while-locked. Playwright does not cover the phone; this is manual.

## Explicitly out of scope (decision 4)

- TestFlight / App Store distribution, paid membership, 3d's review-risk check — none apply
  to personal sideloads. If the membership is ever bought, 3e (TestFlight on a real device)
  becomes the distribution route and this port feeds it directly.

## Risks

- 7-day expiry is annoying but mechanical once scripted; the build itself is unsigned-by-Apple
  so no notarization concerns on-device.
- YouTube bot-checks can hit sideloaded apps harder than the macOS client — the yt-dlp fallback
  path is shared, so worst case degrades the same way as desktop.

- Task 11 (metered audio-only, macOS side shipped 2026-11-16): on iOS use NWPathMonitor natively
  in Swift (no helper dylib needed — the macOS build needed swift/netmonitor.swift because the
  hand-rolled block ABI segfaulted; iOS is Swift-native). `path.isExpensive` covers hotspot;
  cellular detection is `NWPathMonitor` + `NWInterfaceType.cellular` if a cellular-only rule is wanted.
