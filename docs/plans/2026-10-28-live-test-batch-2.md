# Live-test batch 2 (2026-10-28) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the ten defects and gaps the owner found in a second live `tauri dev` test on 2026-10-28, after the first batch shipped.

**Architecture:** Each task is an independent vertical fix (Rust command/query + TS binding + UI + test) committed and pushed on its own. **Causes marked `(measured)` were read from the source or the owner's real database this session; causes marked `(to verify)` are a reading of the symptom and MUST be confirmed against the code before any fix is written.**

**Tech Stack:** Tauri 2, Rust (sqlx/SQLite, `rss` crate, tokio), React + TanStack Query, Vitest, mock router (`src/mocks/router.ts`) as the browser backend.

**Spec:** the owner's live-test report, 2026-10-28 21:16 CET. No separate design doc.

## Owner's report, verbatim

> "The video playback tends to scale too large, not fitting the window size (only making the window
> full screen scaled the video down to fit inside. jumping around in a playing episode with the play
> bar still only works for video, not for podcasts. the audio only checkbox doesn't seem to do
> anything. my idea way to have it stop streaming the video stream of a video and stream only its
> audio stream from youtube when this made is active. that saves date and should also have faster
> load times when the connection is slow or flaky."

> "what's good: the queue now allowst to change what's playing by clicking on it, very good. the
> smart link menu no longer liste the identical title 100% confidence entries as waiting to confirm,
> that's an improvement. but the 85% confidence items should be learned. video title identical but the
> video title carries a pipe divider plus the known podcast name which matches the podcast channel
> name. that is logically also a absolute certain match that doesn't need user confimation. the
> formula is simple enough to spot and other youtube channels may use a slightly different setup to
> highlight their podcast episode videos, but in spirit many will likely do something similar, so you
> should also account for permutations of this. dash or m-dash instead of the pipe divider or the
> podcast show title before the episode title etc. should all be easily understood and recognized as
> certainly matching."

> "it shouldn't only try to match individual episodes but rather recognize patterns for matching
> entire channels as in the youtube channel the verge holds the matching podcast episodes for the
> vergecast which is a podcast. so the channels are linked because the podcast episodes live in both
> places. I should now only see uncertain link candidates to confirm in the smart link tab, I should
> see which channels are already linked so I can explore there."

> "in search, the all tab tends to keep showing me the same results as before up first even though I
> changed what I'm searching for. the podcast tab shares this issue for example when I search for even
> more news instead of verge or vergecast is still keeps showing me many individual vergecast episodes
> rather than even more news and only at the bottom it correctly shows me a card for the some more news
> podcast channel under the title podcast directory but it's not clickable. I should be able to click
> on the shows podcast directory card to see inside and finde the episodes. I should now see unrelated
> vergecast episodes in the search when i search for even more news which is a different show."

> "and subscriptions seem to be missing, there's no obvious way to subscribe to a channel. I should be
> able to click on the channel name when watching one of their videos. furthermore there's still some
> buttons in the play bar with uncclear purpose and they don't seem to be wired yet. getting rid of
> them without a second thought is not the answer, we need to find out why they were put there in the
> first place. please document all of these problems and then work on fixing them with proper test
> fixtures too so we don't get regressions."

## Global Constraints

- **Owner decisions carried from batch 1** (2026-10-27): unsubscribed channels are **hidden, never deleted**; run all tasks smallest-first, commit + push each.
- Every new Rust command gets a TS binding in `src/hooks/useTauriCommands.ts`, a mock in `src/mocks/router.ts`, and passes `src/__tests__/tauri-command-contract.test.ts`.
- **Mock parity:** whatever shape the real command returns, the mock returns — and vice versa.
- Gates per task: `./node_modules/.bin/tsc --noEmit` clean, `./node_modules/.bin/vitest run` all green, `cargo test` (src-tauri) green, `cargo build` with **zero warnings**. Use `node_modules/.bin`, never `npx`.
- Never write to the owner's real DB (`~/Library/Application Support/app.echoprism/`); read it with `sqlite3 -readonly` only. Tests use temp/in-memory DBs.
- Commits staged **by path**; `node_modules/.package-lock.json` is never staged. Every commit message ends with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Co-Authored-By: Step 5 Preview <noreply@stepfun.com>`. Push `master` after each task. Never tag, release, or force-push.
- **TDD every change**: write the test, run it, see it FAIL for the right reason (missing behaviour, not a typo or import error), implement, see it PASS. **Mutation-check each new guard** (break it, confirm a test fails, restore, `cmp`). Never weaken or delete a test to get green.
- zsh: quote globs (`'*.ts'`), never start a word with `=`, never put `$1`/`$40` in double quotes.
- Never restart/kill anything on ports 4141–4151 or 8000–8010. Never print process argv.
- A changed `query!` needs the `.sqlx` cache regenerated — run `scripts/sqlx-prepare.sh`.

## Review Focus

1. **The dead "Volume" button** (Task 1) — a button with no handler, duplicating the accessible name of the live slider beside it. The owner's instruction is explicit: *find out why it was put there, do not just remove it.*
2. **Smart-link over-confidence** (Task 4) — the new channel-suffix and channel-level rules must not auto-link two genuinely unrelated episodes. The hard title gate (`min_title_similarity` 0.7) is the backstop; a permutation rule that widens beyond "the same words, differently branded" is the regression risk.
3. **Search freshness** (Task 7) — a stale-results fix must not break pagination or the podcast directory card.

---

### Task 0: Document the batch (this file)

- [x] All ten problems recorded with the owner's verbatim wording, the measured cause where one exists, and a clear `(measured)` / `(to verify)` label.

---

### Task 1: The play bar's unwired buttons — identify, then decide

**Owner:** "there's still some buttons in the play bar with uncclear purpose and they don't seem to be wired yet. getting rid of them without a second thought is not the answer, we need to find out why they were put there in the first place."

**Cause (measured):** `src/components/screens/PlayerScreen.tsx:309` renders a `<button aria-label="Volume">` with **no `onClick` and no `disabled`** — a pure icon. Directly below it, at line ~319, a real `<input type="range" aria-label="Volume">` is wired to `setVolume`. So the control surface has **two elements named "Volume"**, one of which is inert. The `<amp>` glyph is the standard speaker icon.

**Why it is probably there (to confirm with the owner, not assumed):** speaker icons next to a volume slider ordinarily toggle mute or reveal the slider. Here the slider is always visible, so the button lost its purpose when the layout settled — but the icon was never removed. **Deleting it is the likely answer; the record of why it is inert is what this task must leave behind.**

**Files:** `src/components/screens/PlayerScreen.tsx`.

- [ ] Confirm there is no other unwired button in the bar (Shuffle, Previous, Play/Pause, Next, Restart, Repeat, Fullscreen, Volume-slider are all wired — measured above).
- [ ] Ask the owner one question: **mute toggle, or remove the icon?** Record the answer here.
- [ ] Implement the answer TDD-style. If removed: assert the bar exposes exactly one control named "Volume" and that it is the slider. If a mute toggle: assert it toggles volume to/from the previous value and keeps the slider's value in step.

---

### Task 2: Video does not fit the window

**Owner:** "The video playback tends to scale too large, not fitting the window size (only making the window full screen scaled the video down to fit inside."

**Cause (to verify — read the video container's CSS first):** the video area is `<div className="relative w-full aspect-video bg-black">` (`PlayerScreen.tsx:113`). `aspect-video` fixes a 16:9 box, and `w-full` makes it the width of the column — so on a wide window the box is wider than the viewport height and the `<video>` inside (not constrained by `max-h` or `object-fit`) overflows. Fullscreen coincidentally fits because the screen is also 16:9.

**Interfaces:** none new — this is CSS plus one test asserting the element's computed box.

- [ ] Measure: render PlayerScreen in jsdom is not enough for layout; pin the CONTRACT instead — the `<video>` must carry `className` including `max-h-full`/`object-contain` (or the container must bound it), asserted by a test that reads the rendered attributes.
- [ ] Implement so the video scales to fit BOTH dimensions at any window size, without fullscreen.
- [ ] Owner-verify step: resize the window in `tauri dev` and confirm no overflow.

---

### Task 3: The "Audio only" checkbox does nothing

**Owner:** "the audio only checkbox doesn't seem to do anything. my idea way to have it stop streaming the video stream of a video and stream only its audio stream from youtube when this made is active. that saves date and should also have faster load times when the connection is slow or flaky."

**Cause (measured, two halves):**
1. `setAudioMode` (`PlayerProvider.tsx:194`) writes the store flag and calls `applyPlaybackFormat`, which switches which element is active — but it **never re-resolves the stream**. Toggling while a video plays moves the active element to the hidden `<audio>`, which has no `src`, so nothing changes audibly or visibly.
2. The checkbox is wired (`onChange={(e) => setAudioMode(e.target.checked)}`), so this is not a dead control — it is an *ineffective* one.

**Interfaces:** `setAudioMode(mode: boolean)` gains a re-resolve: toggling must rebuild the stream for the new format. Playback position should carry over (the F06 format-switch sync already exists).

- [ ] Test: toggling Audio only while a video plays re-resolves the stream and the active element gains a src (mock `episodeCommands.stream` and assert it is called again with the audio format).
- [ ] Test: position carries across the switch.
- [ ] Implement, keeping the D7 rule resolution path (a toggle is the standing preference, the chain is per-play — they must not overwrite each other).

---

### Task 4: Smart links — learn the certain matches

**Owner:** "the 85% confidence items should be learned. video title identical but the video title carries a pipe divider plus the known podcast name which matches the podcast channel name. that is logically also a absolute certain match that doesn't need user confimation… you should also account for permutations of this. dash or m-dash instead of the pipe divider or the podcast show title before the episode title etc."

Two distinct rules, both the owner's ask:

**4a — a branded title is a certain match.** Measured today: `title_similarity_for_pairing` strips a trailing segment equal to the OTHER side's channel name, which already takes `"Why Billionaires Should Not Exist | Some More News"` to 1.0. So the mechanism exists; what is missing is the **permutations** the owner names: `|`, `-`, `–`, `—` as the divider, and the show title BEFORE the episode title rather than after. A prefix form (`"Some More News: Episode Title"`) is already the documented shape in the matcher's own comments.

**4b — channel-level linking.** The YouTube channel *The Verge* holds the podcast episodes for *The Vergecast*. The owner wants channels recognised as LINKED because their episodes live in both places — not only episode pairs. This is a new concept, not a tuning of the existing one.

**Files:** `echoprism-matcher` scoring (`src-tauri/src/matcher/mod.rs`), the smart-links list (so linked channels appear), `SmartLinksPanel.tsx`.

**Interfaces (4a):** a shared `strip_show_branding(title, other_channel)` handling any divider and either position.
**Interfaces (4b):** a way to say "these two channels are linked" — propose deriving it from the confirmed episode pairs rather than storing it, so nothing new is persisted (and the owner's "hidden, never deleted" spirit is preserved).

- [ ] 4a test matrix: `|`, `-`, `–`, `—`, and `:` as dividers; suffix AND prefix placement; each must reach 1.0 title similarity AND confidence ≥ 0.9.
- [ ] 4a guard test: an UNRELATED trailing segment must still count as content (this already exists — `a_trailing_name_that_is_not_the_channel_still_counts` — extend it to the new dividers).
- [ ] 4b: decide and record the mechanism, then test that a pair of channels sharing ≥N confirmed episodes is reported as linked.

---

### Task 5: The Smart Links tab shows only uncertain candidates, plus the linked channels

**Owner:** "I should now only see uncertain link candidates to confirm in the smart link tab, I should see which channels are already linked so I can explore there."

**Depends on Task 4b.**

**Interfaces:** the list command filters out pairs that are now certain (4a), and additionally returns the linked-channel set (4b).

- [ ] Test: a pair the new rules call certain is NOT listed as awaiting confirmation.
- [ ] Test: linked channels are listed and each is a link to that channel's screen (`/channels/:id` from batch 1).

---

### Task 6: The Podcast Directory card is not clickable

**Owner:** "only at the bottom it correctly shows me a card for the some more news podcast channel under the title podcast directory but it's not clickable. I should be able to click on the shows podcast directory card to see inside and finde the episodes."

**Cause (to verify):** the directory card in the search results renders without a click target. Batch 1 shipped `/channels/:id` and `ChannelScreen`, so the fix is wiring, not a new screen.

- [ ] Test: clicking the directory card navigates to `/channels/:id` and the channel's episodes render.

---

### Task 7: Search returns stale results

**Owner:** "in search, the all tab tends to keep showing me the same results as before up first even though I changed what I'm searching for… I should now see unrelated vergecast episodes in the search when i search for even more news which is a different show."

Two symptoms that may share one cause or may be two:
- **Stale results** — changing the query keeps the previous results "up first".
- **Unrelated results** — searching `even more news` surfaces viele Vergecast episodes.

**Cause (to verify — check the search screen's query key and the mock/Rust filtering):** a react-query `queryKey` that omits the search term (or omits the active tab) would serve the previous query's rows from cache, which explains BOTH the staleness and, if the previous term was "vergecast", why vergecast episodes dominate the list. The "unrelated" symptom is then a consequence, not a separate bug — but the Rust `search_episodes` filtering must also be checked for a LIKE pattern that over-matches.

- [ ] Confirm the query key includes the term AND the tab.
- [ ] Confirm the Rust/mock filter cannot return rows matching only a different term.
- [ ] Test: changing the search term replaces the results (no previous-term rows survive).

---

### Task 8: No obvious way to subscribe to a channel

**Owner:** "subscriptions seem to be missing, there's no obvious way to subscribe to a channel. I should be able to click on the channel name when watching one of their videos."

**Cause (to verify):** `subscribe` exists on `channelCommands` and the Channels screen uses it, but nothing in the watch/search surface calls it. Batch 1 made channels navigable, so the natural home is `ChannelScreen`.

**Interfaces:** `subscribe(externalId, channelType, instanceId?)` already exists and returns a `Channel`.

- [ ] Test: the channel screen offers a Subscribe control for an unsubscribed channel and it calls the command; a subscribed channel offers Unsubscribe instead.

---

### Task 9: Regression fixtures for everything above

**Owner:** "please document all of these problems and then work on fixing them with proper test fixtures too so we don't get regressions."

Every task above carries its own test. This task is the sweep:

- [ ] Each new test is mutation-checked (break the fix, watch it go red, restore, `cmp`).
- [ ] No existing test was weakened to reach green; if one needed updating (like the two Task 4 tests that asserted a false premise about the Vergecast fixture), the wrong premise is recorded IN the test's comment so it cannot be re-derlived.

---

### Task 10: Whole-branch review

After all tasks, dispatch an independent adversarial review of `git diff <batch-1-head>..HEAD` scoped to the changed files, check every finding against the real code (reviewers invent file names), fix confirmed Critical/Important findings TDD-style, then write the final summary into §11.

---

## Progress

- [x] Task 0 — document the batch
- [ ] Task 1 — unwired play-bar buttons (owner question pending)
- [ ] Task 2 — video fits the window
- [ ] Task 3 — Audio only actually streams audio
- [ ] Task 4 — smart links learn the certain matches
- [ ] Task 5 — smart links tab: uncertain only + linked channels
- [ ] Task 6 — podcast directory card clickable
- [ ] Task 7 — search freshness
- [ ] Task 8 — subscribe from the channel surface
- [ ] Task 9 — regression fixtures sweep
- [ ] Task 10 — whole-branch review

## Notes

**One owner question is genuinely blocking** (Task 1: mute toggle vs remove the icon). Everything else can proceed autonomously; rulings go in the ledger at `.superpowers/sdd/<plan>/progress.md`.

**A named "DO NOT" for whoever executes this:** do not delete the dead Volume button to make the bar tidy. The owner explicitly rejected that reflex. Find out why it is there first.
