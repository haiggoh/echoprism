# Live-test batch 4 (2026-11-02) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the seven issues the owner found in the live `tauri dev` session on 2026-11-02 (port conflict on 1420 was a leftover process, not a defect).

**Architecture:** Each task is an independent vertical fix (store/UI + test) committed on branch `fix/live-test-batch-4-2026-11-02` in a dedicated git worktree of this repo, merged to master and released (v0.1.3) via `rtc-ship.sh` at the end — the owner's Stop-hook goal authorises shipping plus the Homebrew tap add.

**Tech Stack:** React + zustand + TanStack Query, Vitest, Playwright, mock router, Rust/sqlx for stream info.

**Spec:** the owner's messages of 2026-11-02 18:01–18:12 CET; AskUserQuestion answer: play-now inserts **at the cursor (before the current item)**.

## Owner's report, verbatim (condensed)

1. Queue must never hold the same video/podcast twice — re-queuing moves it to play-next.
2. Switching to audio shows a weird undecipherable icon (screenshot) — replace with the headphones symbol (the consciously retired-replacement mark).
3. Audio-only on podcasts must keep showing cover art — "audio only" means no video, not no images.
4. The video stream must show its YouTube thumbnail when audio-only is on.
5. Loading a 90-minute podcast takes really long — some streaming technique must let us skip around in podcasts too.
6. Timeline skipping sometimes fails with an error in both videos and podcasts — get this stable.
7. Two equal-size card buttons: Play now (plays immediately without altering the queue — inserts **at the cursor**) + one queue button whose add-to-end vs play-next behaviour follows the Settings choice.

## Global Constraints

- Gates per task: `./node_modules/.bin/tsc --noEmit` clean, vitest green, `./node_modules/.bin/eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0`, `cargo test` + `cargo build` zero warnings (Rust touched). Use `node_modules/.bin`, never `npx`. On this machine run node tools via `DYLD_LIBRARY_PATH=/tmp/nodefix /opt/homebrew/bin/node <entry>` (waypoint mac-node-simdjson-mismatch).
- Mock parity: the mock returns what the real command returns and accepts what it accepts.
- Never write to the owner's real DB (`~/Library/Application Support/app.echoprism/`).
- Commits staged by path; `node_modules/.package-lock.json` never staged. Trailers: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` + `Co-Authored-By: Mistral Large 4 "Le Chonk" 1T-A52B <noreply@mistral.ai>`.
- TDD every change; mutation-check each new guard; never weaken a test.
- Tests click the REAL controls (`getByRole`/`getByLabelText`), never a probe calling the context directly.
- Never kill/restart anything on ports 4141–4151 or 8000–8010. Port 1420: only processes this session started.

## Review Focus

1. **Dedupe must not reorder silently wrong**: re-queueing an already-queued episode moves it — the cursor must keep pointing at the playing episode (queueSlice remove/insert math). Test pins cursor identity in queueSlice-dedupe.test.
2. **Play-now at the cursor with a 3-item queue at cursor 0**: new clip at index 0, old current at 1, items 2–3 after — order preserved.
3. **Cover art fallback**: an episode with no thumbnail anywhere falls back to the headphones glyph, never a broken image.
4. **The queue button's label must follow the preference**, not a hardcoded choice — changing Settings' Queue Behavior changes the button's name and behaviour on the next render.
5. **Seek errors must not kill playback** — a seek-induced media error downgrades to a warning toast and playback continues.

---

### Task 1: Queue dedupe — never the same episode twice (item 1)

**Files:** Modify `src/store/slices/queueSlice.ts` (addItem, playNextItem, playNowItem); Test: `src/__tests__/queue-dedupe.test.tsx`.

**Interfaces:** all three actions dedupe on `episode_id`: when the queue already holds that episode, the item MOVES to the target slot (remove + insert, `reorderItems`' cursor math reused in spirit) instead of inserting a duplicate; `playNowItem` inserts at `currentIndex` (owner answer) and moves the cursor onto the new item; dedupe inside playNowItem first removes the twin, then inserts at the twin's original index if it was BEFORE the cursor (so the cursor lands on the new clip, the queue order of the rest is preserved).

- [ ] Tests: queue [A,B,C] cursor 0: addItem(D) appends → [A,B,C,D]; addItem(B) → [A,C,B] (moved to end); playNextItem(D) → [A,D,B,C]; playNowItem(B) → [B,A,C] with cursor 0 on B; playNowItem(D) → [D,A,B,C] cursor 0. Fail → implement → pass → mutation-check (drop the dedupe branch → red) → commit.

### Task 2: Audio-mode icon = headphones, everywhere (item 2)

**Files:** Modify `src/components/ui/PrismAppIcon.tsx` (audioOnly renders the headphones mark inside the gradient tile, not the pale PrismMark), `src/components/screens/PlayerScreen.tsx` (the audio-stage inline glyph svg → `HeadphonesIcon`); Tests: `app-icon-sync.test.tsx` (audioOnly → headphones path present), PlayerScreen stage test.

- [ ] Test: PrismAppIcon with audioOnly shows `data-testid="headphones-mark"`; PlayerScreen in audio mode shows HeadphonesIcon, not the retired glyph path. Fail → implement → pass → mutation-check → commit.

### Task 3: Cover art in audio-only mode (items 3+4)

**Files:** Modify `src/components/screens/PlayerScreen.tsx` audio branch: `const art = episode.thumbnail_url ?? episode.channel?.thumbnail_url`; art present → `<Thumbnail src={art}>` filling the stage; absent → HeadphonesIcon fallback. Test in the same stage test file.

- [ ] Tests: podcast episode with `thumbnail_url` in audio mode → `img` with that src renders on the stage; VIDEO episode with thumbnail in audio mode → same thumbnail renders (item 4); episode with no art → headphones fallback. Fail → implement → pass → commit.

### Task 4: Two equal card buttons — Play now at cursor + preference-driven queue button (item 7)

**Files:** Modify `src/components/feed/EpisodeCard.tsx` (two `flex-1` equal buttons: `Play now` → `onPlayNow`, and ONE queue button labelled by the preference), `src/components/screens/FeedScreen.tsx` + `ChannelScreen.tsx` (pass both handlers; queue button label from the same preferences query), `src/hooks/useEpisodePlay.ts` (expose `handlePlayNow`); Tests: `card-click-model.test.tsx` extended.

- [ ] Tests: card renders exactly two action buttons of equal width (`flex-1`); clicking `Play now` calls the play-now path with the cursor insert from Task 1; with `queue_behavior: 'play_next'` the second button reads "Play next" and inserts after the cursor; with `add_end` it reads "Add to end" and appends. Fail → implement → pass → mutation-check → commit.

### Task 5: Seek stability — a seek error must not kill playback (item 6)

**Files:** Modify `src/components/PlayerProvider.tsx`: `preload="metadata"` on both media elements; a `seekingRef` set by `seek()` and cleared on `seeked`; the media `error` handler: when a seek is in flight, downgrade to a warning toast ("Seeking — this stream is slow to jump in; trying to continue") and do NOT `setPlaying(false)`; genuine load errors keep the existing danger path. Test: `src/__tests__/seek-stability.test.tsx`.

- [ ] Tests: seek then fire `error` on the element → `isPlaying` stays true, no danger toast; fire `error` with NO seek in flight → existing danger toast + paused (existing behaviour preserved). Fail → implement → pass → mutation-check → commit.

### Task 6: Podcast load/seek performance (item 5) — measured cause + shipped fix

**Measured:** `stream_episode` returns the enclosure URL DIRECTLY (`enclosure_stream_for`, `episodes.rs:200-215`) — no proxy, so range/seek behaviour is the CDN's. The frontend loaded eagerly. **Shipped fix:** `preload="metadata"` (Task 5) makes playback start after metadata instead of buffering ahead, and seeking uses HTTP Range when the CDN supports it. **(to verify):** whether the owner's slow 90-min enclosure CDN honours Range — needs a live check against a real feed URL with `curl -r`; if a specific CDN is found without Range support, file it separately (a proxy is out of scope for this batch). Rust test pins the direct-URL contract (`enclosure_stream_for` returns the raw URL with no headers — existing tests already do; re-run).

- [ ] Run the live Range check against one real enclosure URL, record the result in the plan's Progress section; no code change unless a defect is found in OUR serving path (there is none — direct URL).

### Task 7: Whole-batch adversarial review + ship

- [ ] Full gates; then dispatch the branch diff to a free validator OUTSIDE this session's family (`free-agent-tool.py`, `avoid_family: mistral`); check every finding against the code; fix confirmed Critical/Important TDD-style.
- [ ] Ship via `rtc-ship.sh` as **v0.1.3** ("live-test batch 4"), then add the Homebrew cask (`Casks/echoprism.rb` from the release dmg) + README entry in the homebrew-tap checkout, commit and push the tap.

## Progress

- [x] Task 1 — queue dedupe (f924ebad + 34524ec2)
- [x] Task 2 — headphones icon (55388189)
- [x] Task 3 — cover art in audio-only (691b7cd0)
- [x] Task 4 — two equal card buttons (34535875)
- [x] Task 8 — relabel smart-link switch (64bb2ddb)
- [x] Task 10 — matcher certainty (21ff2fa6)
- [x] Task 5 — seek stability + preload=metadata (45f795fd)
- [x] Task 9 — splash screen (this commit)
- [x] Task 6 — podcast load/seek: LIVE CHECK 2026-11-03 on a real enclosure from the owner's DB (podtrac redirect → CDN): range request answered HTTP 206 with accept-ranges: bytes and content-range: bytes 0-1023/161713497 — the CDN fully supports Range, so mid-file seeking works natively once metadata loads; shipped: preload="metadata" on both media elements + seek-error downgrade (Task 5). No proxy needed.
- [ ] Task 7 — review + ship + tap
