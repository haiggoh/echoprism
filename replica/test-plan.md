# EchoPrism Test Plan

Based on `replica/recon.md` flows F01-F12.

## Test Environment
- **Local dev server**: `npm run dev` (Vite + Tauri)
- **Test runner**: Playwright + Chromium
- **Seed data**: `npm run db:seed` (realistic fake data)
- **A11y**: `@axe-core/playwright` on each screen

---

## F01: First Run Setup
**Flow**: S01 → S02
**Happy Path**: F01-H1
1. Launch app → lands on S01 (Onboarding)
2. Step 1: Click "Get Started" → S01 step 2
3. Step 2: Enter valid Invidious URL, select type → click "Add Instance" → S01 step 3
4. Step 3: Click "Skip for now" → S01 step 4
5. Step 4: Click "Open Feed" → lands on S02 (Feed) with empty state

**Edge Cases**:
- F01-E1: Empty instance URL → "Add Instance" disabled
- F01-E2: Invalid URL format → validation error on blur
- F01-E3: Instance unreachable → error toast, stays on step 2
- F01-E4: Very long URL (2000+ chars) → truncated in input, validation passes
- F01-E5: Double-click "Add Instance" → only one request sent
- F01-E6: Refresh mid-onboarding → persists step via localStorage
- F01-E7: Back button on step 2 → returns to step 1
- F01-E8: Offline during instance test → shows offline warning, allows continue
- F01-E9: Mobile width (390px) → all elements fit, touch targets 44px
- F01-E10: Keyboard only → Tab through all, Enter submits, Escape closes modals
- F01-E11: Screen reader → all labels announced, progress announced

**Negative Cases**:
- F01-N1: Instance returns 404 → error toast, stays on step 2
- F01-N2: Instance returns 500 → error toast, stays on step 2
- F01-N3: Instance returns invalid JSON → error toast, stays on step 2

---

## F02: Discover & Subscribe
**Flow**: S02 → S07 → S06 → S02
**Happy Path**: F02-H1
1. On S02 (Feed), click search icon → S07 (Search)
2. Type channel name → results appear in real-time
3. Click channel → S06 (Channel Page)
4. Click "Subscribe" → toast "Subscribed", button changes to "Subscribed"
5. Click back → S02 shows new channel in feed

**Edge Cases**:
- F02-E1: Empty search query → shows trending/popular
- F02-E2: Very long query (500+ chars) → truncated, searches first 200
- F02-E3: Emoji in query → handles correctly
- F02-E4: Two tabs searching different terms → independent state
- F02-E5: Double-click channel → single navigation
- F02-E6: Subscribe, then immediately unsubscribe → toast each time
- F02-E7: Refresh after subscribe → subscription persists
- F02-E8: Offline during search → shows cached results + offline badge
- F02-E9: Mobile width → search input full width, results stacked
- F02-E10: Keyboard only → arrows navigate results, Enter opens
- F02-E11: Screen reader → search announced, results count announced

**Negative Cases**:
- F02-N1: Private channel → shows "Channel unavailable"
- F02-N2: Deleted channel → shows "Channel not found"
- F02-N3: Instance failover during search → retries, shows results

---

## F03: Play Video
**Flow**: S02 → S03 → S14
**Happy Path**: F03-H1
1. On S02, click video episode → S03 (Video Detail)
2. Video auto-plays in inline player
3. Click fullscreen → S14 (Fullscreen Player)
4. Video plays with controls visible on hover
5. Press Esc → exits fullscreen, returns to S03

**Edge Cases**:
- F03-E1: Age-restricted video → shows age gate, requires instance with age support
- F03-E2: Geo-blocked video → tries next instance in pool
- F03-E3: SABR fails → falls back to HLS
- F03-E4: Instance fails mid-playback → auto-failover, resumes from position
- F03-E5: Quality selector → changes quality, buffers briefly
- F03-E7: Variable speed (0.5x-3x) → pitch correction at 2x+
- F03-E8: PiP toggle → enters PiP, continues on home screen
- F03-E9: Double-tap seek → configurable forward/back
- F03-E10: Mobile width → controls auto-hide after 3s
- F03-E11: Keyboard → Space play/pause, arrows seek, F fullscreen
- F03-E12: Screen reader → player controls labeled

**Negative Cases**:
- F03-N1: All instances fail → shows "No working instances", retry button
- F03-N2: yt-dlp extraction fails → fallback to Invidious HLS
- F03-N3: Network disconnect → pauses, shows offline indicator, resumes on reconnect

---

## F04: Play Podcast
**Flow**: S02 → S04 → S15
**Happy Path**: F04-H1
1. On S02, click podcast episode → S04 (Audio Detail)
2. Audio auto-plays, mini-player S15 appears
3. Click mini-player → expands to full S04
4. Chapters visible, click chapter → seeks
4. Press home/lock → audio continues in background
5. Bluetooth headphones → play/pause works

**Edge Cases**:
- F04-E1: No audio stream → shows "No audio available"
- F04-E2: Episode missing → shows "Episode unavailable"
- F04-E3: Background audio killed by OS → resumes on app reopen
- F04-E4: Bluetooth disconnect → pauses, resumes on reconnect
- F04-E5: Phone call interrupt → pauses, resumes after call
- F04-E5: Sleep timer → fades out, stops at end
- F04-E6: Variable speed with pitch correction
- F04-E7: Waveform seek → drag to position
- F04-E8: Mobile width → waveform full width

**Negative Cases**:
- F04-N1: Audio extraction fails → shows error, retry button
- F04-N2: Background audio permission denied → guides to settings

---

## F05: Queue Management
**Flow**: S02 → S05 (drag)
**Happy Path**: F05-H1
1. On S02, drag episode to queue → S05 shows item
2. Drag to reorder → position updates
3. Click "Play Next" on another episode → inserts at position 1
4. Remove item → queue updates
5. Clear queue → confirmation dialog, then empty

**Edge Cases**:
- F05-E1: Drag to same position → no change
- F05-E2: Drag from feed to queue → adds to end
- F05-E3: Shuffle toggle → randomizes order
- F05-E4: Repeat modes (off/one/all) → cycles correctly
- F05-E5: Audio-only mode → shows only audio items
- F05-E6: Mobile width → drag handle visible, touch drag works

**Negative Cases**:
- F05-N1: Remove playing item → plays next, removes from queue

---

## F06: Audio↔Video Switch (Smart Link)
**Flow**: S03 ↔ S04 (Smart Link)
**Happy Path**: F06-H1
1. Playing video on S03, Smart Link badge shows
2. Click badge → switches to S04 (audio), position synced
3. Click badge on S04 → switches to S03 (video), position synced

**Edge Cases**:
- F06-E1: No match → badge not shown
- F06-E2: Low confidence (< 0.5) → badge shows "?" with lower opacity
- F06-E3: Position sync fails → starts from beginning, toast
- F06-E4: Manual override → user confirms/unlinks, persists
- F06-E5: Switch mid-playback → smooth transition

**Negative Cases**:
- F06-N1: Match deleted → badge disappears
- F06-N2: Both formats unavailable → badge hidden

---

## F07: Background Audio
**Flow**: S14 → S15 (home) → S15 (lock)
**Happy Path**: F07-H1
1. Playing in S14, press home → S15 persists
4. Lock screen → S15 shows on lock screen with controls
5. Unlock → S15 still there, tap to expand

**Edge Cases**:
- F07-E1: OS kills background → resumes on reopen
- F07-E2: Bluetooth disconnect → pauses, resumes
- F07-E3: Phone call → pauses, resumes
- F07-E4: Other app plays audio → pauses, may resume

**Negative Cases**:
- F07-N1: Background audio permission denied → guide to settings

---

## F08: Offline Download
**Flow**: S03/S04 → S13
**Happy Path**: F08-H1
1. On episode, click download → quality selector
2. Select quality → download starts, progress in S13
3. Complete → shows "Downloaded", available offline
4. Play offline → works without network

**Edge Cases**:
- F08-E1: Storage full → error, shows space needed
- F08-E2: Network change (WiFi → cellular) → pauses, resumes on WiFi
- F08-E3: Quality unavailable → shows next best
- F08-E4: Pause/resume → persists progress
- F08-E5: Cancel → removes partial file

**Negative Cases**:
- F08-N1: Cancel mid-download → removes partial, no orphan files
- F08-N2: App killed during download → resumes on reopen

---

## F09: Instance Failover
**Flow**: S03/S04 → S09 (auto)
**Happy Path**: F09-H1
1. Instance fails mid-playback → detects 403/404/timeout
2. Pauses → switches to next healthy instance
3. Resumes from position (buffered 10s ahead)

**Edge Cases**:
- F09-E1: All instances down → shows "No working instances"
- F09-E2: Manual override → user picks instance, pins
- F09-E3: Failover during seek → completes seek on new instance

**Negative Cases**:
- F09-N1: No healthy instances → shows error, retry button

---

## F10: Smart Episode Link
**Flow**: S03/S04 → S11 (auto WiFi)
**Happy Path**: F10-H1
1. Background task runs on WiFi + charging
2. Matches podcast episodes to YouTube videos
3. Stores matches with confidence in S11
4. User sees badge on next play

**Edge Cases**:
- F10-E1: Not on WiFi → defers, runs next WiFi session
- F10-E2: Battery saver on → defers
- F10-E3: Low confidence → shows in S18 for manual review
- F10-E4: Manual link → user confirms, stores in S18

**Negative Cases**:
- F10-N1: No matches found → S18 empty
- F10-N2: Wrong match → user unlinks, reports

---

## F11: Keyboard Navigation
**Flow**: S02 (shortcuts)
**Happy Path**: F11-H1
1. Press `?` → S16 (Shortcuts Help) opens
2. Press `j`/`k` → navigates feed
3. Press `Space` → play/pause
4. Press `f` → fullscreen
5. Press `m` → mute
6. Press `←`/`→` → seek 10s
7. Press `Shift+←/→` → seek 30s
8. Escape → closes modals, exits fullscreen

**Edge Cases**:
- F11-E1: Focus trap in modals → Tab cycles within modal
- F11-E2: Shortcut conflict → user custom wins
- F11-E3: Input focused → shortcuts disabled
- F11-E4: Mobile → no keyboard shortcuts

---

## F12: OPML Import/Export
**Flow**: S10 → S02
**Happy Path**: F12-H1
1. On S10, click "Import OPML"
2. Select file → parses, shows preview with count
3. Click "Import" → subscribes to all, shows progress
4. Export → downloads OPML with all subscriptions

**Edge Cases**:
- F12-E1: Malformed OPML → shows error with line number
- F12-E2: Duplicate feeds → merges, keeps latest
- F12-E3: GUID conflict → keeps existing, logs warning
- F12-E4: Large file (1000+ feeds) → batches, shows progress
- F12-E5: Empty file → shows "No feeds found"

**Negative Cases**:
- F12-N1: Not an OPML file → "Invalid file format"
- F12-N2: Corrupt XML → "Failed to parse"

---

## Test Execution

```bash
# Install
npm i -D @playwright/test @axe-core/playwright
npx playwright install chromium

# Run tests
npx playwright test

# Run with UI
npx playwright test --ui

# Debug
npx playwright test --debug
```

## Coverage Targets

| Flow | Happy Paths | Edge Cases | Negative | Total |
|------|-------------|------------|----------|-------|
| F01  | 1 | 11 | 3 | 15 |
| F02  | 1 | 11 | 3 | 15 |
| F03  | 1 | 12 | 3 | 16 |
| F04  | 1 | 8 | 2 | 11 |
| F05  | 1 | 6 | 1 | 8 |
| F06  | 1 | 5 | 2 | 8 |
| F07  | 1 | 4 | 1 | 6 |
| F08  | 1 | 5 | 2 | 8 |
| F09  | 1 | 3 | 1 | 5 |
| F10  | 1 | 4 | 2 | 7 |
| F11  | 1 | 4 | 0 | 5 |
| F12  | 1 | 5 | 2 | 8 |
| **Total** | **12** | **79** | **22** | **113** |

---

## Accessibility Checklist

Every screen must pass:
- [ ] No axe violations (WCAG AA)
- [ ] All interactive elements reachable by keyboard
- [ ] Visible focus indicators
- [ ] ARIA labels on all icon-only buttons
- [ ] Live regions for dynamic content
- [ ] Reduced motion respected
- [ ] High contrast mode works
- [ ] Screen reader announces state changes

## Performance Budgets

- Initial load: < 3s
- Feed render: < 100ms
- Search results: < 500ms
- Video start: < 2s
- Instance failover: < 500ms

## Bug Severity Thresholds

| Severity | Action |
|----------|--------|
| S1 | Block release, fix immediately |
| S2 | Fix before release |
| S3 | Fix in next sprint |
| S4 | Backlog |

---

## Next Step

`/replica-diff` — Compare clone against original