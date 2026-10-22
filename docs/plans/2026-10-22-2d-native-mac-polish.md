# Execution Plan — 2d: Native Mac polish (menu bar, media keys, Now Playing, window restore)

_Authoring date: 2026-10-22. Roadmap parent: step 2d — "Native Mac polish: the
menu bar, media keys and Now Playing (the media plugin is already loaded), and
the window remembering its size and position."_

### Discovery findings (verified 2026-10-22, before any code)

1. **The roadmap's media premise is false on macOS.** `tauri-plugin-media-session`
   0.2.4 IS registered (`src-tauri/src/lib.rs`), but its README states
   "macOS ❌ Not yet — Not implemented" and its source is `cfg`-gated to
   android/ios only. It contributes nothing on the Mac, and no JS binding is
   installed. Media keys / Now Playing need a different route.
2. **The frontend never touches the W3C Media Session API** (`navigator.mediaSession`:
   zero hits in `src/`). That API is WebKit's own route into the OS Now Playing
   panel and hardware media keys, needs no native dependency, and is unit-testable
   with a stubbed `navigator.mediaSession`. Whether WKWebView *inside a Tauri app*
   forwards it to macOS Now Playing is NOT provable from tests — phase 0 probes it
   live. Fallback if it does not: the `souvlaki` crate (native
   MPNowPlayingInfoCenter + MPRemoteCommandCenter) bridged to the frontend by events.
3. **Window restore: size/position work, visibility is a latent defect.**
   `tauri-plugin-window-state` 2.5.0 is registered with default flags
   (`StateFlags::all()`, which includes `VISIBLE`) and saves on `RunEvent::Exit`.
   Our macOS close HIDES the window, so close-then-Cmd+Q saves `visible:false` —
   observed on disk: `~/Library/Application Support/app.echoprism/.window-state.json`
   holds `"visible": false` with a real 1015×1170 size. On restore that only skips
   `show()+set_focus()` (`should_show = state.visible`); the window config creates it
   visible anyway, so today the app still appears (possibly unfocused) — but setting
   `"visible": false` in tauri.conf.json (the usual anti-flicker pattern) would then
   launch with NO window. Fix: exclude `VISIBLE` from the saved flags.
   Also: `plugins.windowState.autoSave` in tauri.conf.json is read by nothing in the
   plugin (it is configured only via the Rust Builder) — dead config.
4. **No custom menu exists**; the app runs Tauri's default macOS menu (app/edit/
   window). Playback controls are reachable only from in-app buttons and the
   global-shortcut table.

### Phases

0. **Live probe (owner-assisted, ~2 min):** after phase 1 lands, play an episode in
   `npm run tauri dev`; check Control Center → Now Playing shows the title, and the
   keyboard ⏯ key pauses. PASS → phase 1 is the whole media story. FAIL → phase 1b
   (souvlaki) becomes the next slice.
1. **Media Session wiring (TDD).** A `useMediaSession` hook used by PlayerProvider:
   feature-detected; metadata (title, channel as artist, thumbnail artwork) on
   episode change; `playbackState` mirrors isPlaying; action handlers play / pause /
   previoustrack / nexttrack / seekto / seekbackward / seekforward route to the
   existing player callbacks; `setPositionState` kept in step with time/duration/
   rate; handlers cleared on unmount. Tests stub `navigator.mediaSession` and assert
   each handler drives the player; mutation-check one handler mapping.
2. **Window visibility fix (Rust).** Build the plugin with
   `StateFlags::all() - StateFlags::VISIBLE` through a named fn with a unit test
   pinning that VISIBLE is excluded and SIZE|POSITION are kept. Drop the dead
   `autoSave` config key.
3. **Playback menu.** A native "Playback" menu (Play/Pause, Next, Previous, Skip
   back/forward) whose items emit an event the frontend routes to the same player
   callbacks as phase 1 — one routing table, two sources. Default accelerators are an
   owner call (see open questions).
4. **Gates.** cargo test + clippy clean, tsc, vitest, Playwright; receipts here.

### Open questions for the owner

- Menu accelerators: Space is taken by in-app play/pause; macOS players commonly
  use ⌘→ / ⌘← for next/previous. Default proposed: ⌘→ next, ⌘← previous,
  ⌥⌘→ / ⌥⌘← skip ±; Play/Pause shown with no accelerator (Space handled in-page).

### Non-goals

iOS/Android media sessions (step 3), a tray/status-bar icon, auto-updater (4d).
