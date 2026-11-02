# Parity audit batch 3 (2026-11-02) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Close the gap between what batches 1–2 promised and what the real app does, and apply the owner's three 2026-11-02 design decisions (one play bar, one audio-only state, a predictable card click).

**Architecture:** Each task is an independent vertical fix (Rust + TS binding + mock + UI + test), committed on branch `fix/parity-audit-2026-11-02`, merged to `master` and tagged at the end (owner authorised the ship loop *through tag*, 2026-11-02 00:40 CET).

**Tech Stack:** Tauri 2, Rust (sqlx/SQLite), React + zustand + TanStack Query, Vitest, mock router (`src/mocks/router.ts`).

**Spec:** the owner's messages of 2026-11-02 00:36–01:03 CET (session b84bc3f3) and the decisions below; the batch-2 plan `docs/plans/2026-10-28-live-test-batch-2.md` for the audio-only wording.

## Owner decisions (2026-11-02, verbatim where quoted)

1. **One play bar.** "we need only one main play bar at the bottom." → the global bottom bar (`MiniPlayer`) is THE transport everywhere; `PlayerScreen` keeps only the video/artwork stage and the title/channel line.
2. **Audio only.** "seven controls for the same function seems overkill" → ONE state, TWO controls: one toggle in the bottom bar and one in the Header. Every other audio-only control is removed.
3. **Card click.** "default behavior is add to queue as play next and the button to play now (without discarding the queue either exists) but I want the user to be able to choose the alternate styles if they want it from inside a settings panel."
4. **Remember audio only** across launches (via the existing `audio_only_default` column).

## Measured defects this batch fixes (read from the code this session)

- **A1 split audio-only state.** Three states mean "audio only": `usePlayerStore.isAudioMode` (the only one the engine reads; written only by the PlayerScreen checkbox and prism toggle), `useQueueStore.audioOnlyMode` (written by the Header, Sidebar, MiniPlayer and Queue-screen checkboxes; read by NOTHING in the engine), and `useConvergence().mode` (prism toggles; reaches the engine only on PlayerScreen). So `1857bed5` fixed one of five surfaces; its test calls `ctx.setAudioMode` from a probe and never clicks a real control.
- **A2 `update_settings` rejects partial updates.** Rust `update_settings(prefs: UserPreferences)` needs every field; every Settings control sends a one-field `Partial<UserPreferences>`. The mock merges partials, so every gate is green while the real app cannot save a single preference.
- **A3 dead settings.** `default_format` (Settings radio) is never read; `queue_behavior` is honoured only by drag-and-drop, not by card clicks.
- **A4 card click.** 'auto' (default) plays when idle and silently queues when busy — the same click does two things. Play-now APPENDS to the end of the queue (`addItem`) so the remaining queue ends up behind the cursor. The feed card's queue-only "Next" button wears a ▶ play triangle.
- **A5 the bar shows the queue item, not the playing episode.** `MiniPlayer` renders `items[currentIndex].episode` and returns `null` with an empty queue. Its Restart is disabled for a one-item queue.
- **A6 fake Picture-in-Picture.** `togglePip` flips `isPip`, which nothing consumes; `requestPictureInPicture` is never called.
- **A7 dead code.** `src/components/ui/EpisodeCard.tsx` (no importer); the feed card's two `{/* Smart link badge would go here */}` stubs (the matrix's must-have "Smart Episode Link badge + one-tap switch").

## Global Constraints

- Gates per task: `./node_modules/.bin/tsc --noEmit` clean, `./node_modules/.bin/vitest run` green, `./node_modules/.bin/eslint . --max-warnings 0`, `cargo test` (src-tauri) green, `cargo build` zero warnings. `node_modules/.bin`, never `npx`.
- Mock parity: the mock returns what the real command returns, and accepts what it accepts.
- Never write to the owner's real DB (`~/Library/Application Support/app.echoprism/`); tests use temp/in-memory DBs.
- Commits staged by path; `node_modules/.package-lock.json` is never staged. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- TDD: see each test fail for the right reason first; mutation-check each new guard (break it, see red, restore, `cmp`). Never weaken a test to reach green; a test that pinned a defect is rewritten with the wrong premise recorded in its comment.
- Tests click the REAL controls (`getByRole`/`getByLabelText`) — never a probe calling the context directly — because a probe is exactly how A1 shipped green.

## Review Focus

1. **Toggling audio only while PAUSED** must switch the format without starting playback (Task 2 test).
2. **A preference saved before the hydration read lands** must not be overwritten by the stale stored value (Task 3 test).
3. **Play now with an EMPTY queue** plays the episode as the queue's only item; with a queue it inserts right after the current item and the rest stays ahead (Task 5 tests).
4. **An old DB row holding `card_click_action = 'auto'`** (the owner's own DB) loads as the new default `queue`, never an error (Task 5 Rust test).
5. **The bottom bar must not cover the player stage** — PlayerScreen reserves the bar's height (Task 4 test on the class contract).

---

### Task 1: `update_settings` accepts a partial patch (A2)

**Files:** `src-tauri/src/commands/settings.rs`, `src-tauri/echoprism-core/src/types.rs`, test in `settings.rs`.

**Interfaces:** Produces `pub struct UserPreferencesPatch` — every `UserPreferences` field except `user_id`/`updated_at` as `Option<T>`, `#[serde(default)]`; `fn apply(self, base: UserPreferences) -> UserPreferences`. `update_settings(db, prefs: UserPreferencesPatch)` reads current prefs, applies, writes. TS signature unchanged (`Partial<UserPreferences>`).

- [x] Test `partial_patch_deserializes_and_merges`: `serde_json::from_value::<UserPreferencesPatch>(json!({"card_click_action":"play_now"}))` is Ok and `apply` changes only that field. Test `full_struct_rejects_partial_json` documents the measured defect (`UserPreferences` from the same JSON is Err).
- [x] Fail → implement → pass → commit.

### Task 2: One audio-only state, two controls (A1, decision 2)

**Files:** `src/store/slices/queueSlice.ts` (remove `audioOnlyMode`/`setAudioOnlyMode`/`selectAudioOnlyMode`), `src/components/Header.tsx`, `src/components/Sidebar.tsx`, `src/components/MiniPlayer.tsx`, `src/components/screens/QueueScreen.tsx`, `src/components/screens/PlayerScreen.tsx`, new `src/components/player/AudioOnlyToggle.tsx`; test `src/__tests__/audio-only-single-state.test.tsx`.

**Interfaces:** `AudioOnlyToggle({ compact?: boolean })` — a checkbox labelled "Audio only mode" bound to `usePlayer().isAudioMode` / `setAudioMode`. Rendered in exactly two places: MiniPlayer and Header. Prism toggles become display-only (`PrismConvergeToggle` with `audioOnly={isAudioMode}` and no `onModeChange` in Header; removed from the bar). Sidebar's `PrismAppIcon audioOnly` and QueueItem's `audioMode` read `usePlayer().isAudioMode`.

- [x] Test: render the app shell (Header + MiniPlayer + PlayerProvider) with a playing video; exactly TWO elements are labelled "Audio only mode"; clicking EACH re-resolves `episodeCommands.stream` with `'audio'`, and both reflect the new state. Paused toggle: format switches, `stream` NOT called, `isPlaying` stays false (Review Focus 1).
- [x] Fail → implement → pass → mutation-check (point one control at a local state: red) → commit.

### Task 3: Remember audio only; retire the dead Default-format setting (decision 4, A3)

**Files:** `src/components/PlayerProvider.tsx`, `src/components/screens/SettingsScreen.tsx`, `src/mocks/router.ts` if needed; test `src/__tests__/audio-only-persisted.test.tsx`.

**Interfaces:** on mount the provider reads `settingsCommands.get()` once and applies `audio_only_default` to the store UNLESS the user toggled first (ref guard, Review Focus 2); `setAudioMode` writes `settingsCommands.update({ audio_only_default: mode })` best-effort (failure logged) and invalidates `['preferences']`. Settings' "Default format" radio is removed (the column stays; nothing read it — the visible audio-only toggle is now its remembered form).

- [x] Tests: stored `true` ⇒ starts in audio mode; toggle writes the pref; toggle-before-hydration keeps the toggled value. Fail → implement → pass → commit.

### Task 4: One play bar (decision 1, A5, A6)

**Files:** `src/components/MiniPlayer.tsx` (→ the full transport), `src/components/screens/PlayerScreen.tsx` (stage + title only, `pb-[76px]` reserve), `src/components/PlayerProvider.tsx` (real PiP); tests `src/__tests__/one-play-bar.test.tsx`, existing PlayerScreen tests updated.

**Interfaces:** the bar shows `usePlayer().currentEpisode` (not the queue item) and renders whenever an episode is loaded. It carries: seek strip + times, Shuffle, Previous, Play/Pause, Next, Restart (enabled when an episode is loaded), Repeat, Speed, Mute + Volume, AudioOnlyToggle, Fullscreen, Picture-in-Picture, Open full player. `togglePip()` calls `videoEl.requestPictureInPicture()` / `document.exitPictureInPicture()` and is disabled when there is no video element or the API is absent; `isPip` follows the element's `enterpictureinpicture`/`leavepictureinpicture` events.

- [x] Tests: on `/player/:id` exactly ONE control named "Play"/"Pause", ONE "Next", ONE "Previous", ONE "Seek"; Repeat/Fullscreen/PiP live in the bar; the bar shows the engine's episode when the queue is empty; Restart enabled with a one-item queue; PiP calls `requestPictureInPicture` on the registered video. Fail → implement → pass → commit.

### Task 5: Card click = play next by default, a real Play now, choosable in Settings (decision 3, A3, A4)

**Files:** `src-tauri/echoprism-core/src/types.rs` (`CardClickAction::from_str` maps legacy `auto` → `Queue`; default `Queue`), `src-tauri/src/db/migrations.rs` (`UPDATE user_preferences SET card_click_action='queue' WHERE card_click_action='auto'`), `src/types/index.ts`, `src/store/slices/queueSlice.ts` (new `playNowItem`), `src/hooks/useEpisodePlay.ts`, `src/components/feed/EpisodeCard.tsx`, `src/components/screens/SettingsScreen.tsx`; tests `src/__tests__/card-click-model.test.tsx` + Rust test.

**Interfaces:** `card_click_action: 'queue' | 'play_now' | 'load_paused'`. `'queue'` honours `queue_behavior` (`play_next` default, `add_end`). `playNowItem(item): void` inserts at `currentIndex + 1` (index 0 when empty) and moves the cursor onto it; `handlePlayNow(episode)` = `playNowItem` + `play(episode, chainMode)`. Card buttons: **Play now** (▶), **Play next** (queue-next glyph), **Add to end** (+). Settings "Card click" options: Add to queue (default; follows Queue behavior), Play now, Open paused; the Queue-behavior radio is labelled as the queue position for clicks AND drops.

- [x] Tests: default click on a card queues it right after the current item and does NOT start playback; Play now with a 3-item queue at cursor 0 plays the episode, puts it at index 1, and items 2–3 remain after it (Review Focus 3, both cases); `add_end` behaviour honoured; Rust: `auto` row ⇒ `Queue` (Review Focus 4). Fail → implement → pass → commit.

### Task 6: Smart-link badge on cards (A7, matrix must-have)

**Files:** `src/components/feed/EpisodeCard.tsx` (badge from the existing smart-links data when the episode has a confirmed link; click plays the linked version in the other format), delete `src/components/ui/EpisodeCard.tsx`; test `src/__tests__/episode-card-smart-link.test.tsx`. Exact data source is decided at implementation time from the existing smart-link commands (read them first; no new command if one already answers "linked counterpart of episode X").

- [x] Test: a linked episode shows a badge naming the other format; clicking it plays the counterpart; unlinked shows none. Fail → implement → pass → commit.

### Task 7: Replica re-runs and the two never-run skills

- [x] `replica-test` against the current app → `docs/test-plan.md`/`docs/bugs.md` refreshed; `replica-diff` → `docs/parity.md` regenerated against `features.csv` (verified per feature by code, not by claim).
- [x] `replica-launch` and `replica-deploy` (never run on this repo) → their documents only; nothing published.

### Task 8: Ship

- [x] Version bump on every surface (package.json, tauri.conf.json, Cargo.toml ×2, Cargo.lock), CHANGELOG entry, merge to `master`, tag `v0.1.2`, verify the tag on the host.

**Zero local-offload steps, stated at plan level:** every task edits live multi-layer code against this repo's toolchain; the plan-doc promise extraction for the audit WAS offloaded (free dispatch, 4 batches).
