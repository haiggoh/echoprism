# F05 — Queue management completion (confirmation, remove-playing, repeat/shuffle pins)

**Status: IN PROGRESS (2026-10-19).** Full-auto continuation of the P3 plan of record
(replica/test-plan.md F05) after D6/D7 + review fixes landed (954e6b61, 709c4046).

## Context and objectives

**Project:** EchoPrism (~/ClaudeWorkspace/echoprism, local-only repo, no remote).
**Current → required behavior (replica/test-plan.md F05):**

| Case | Plan text | Live state (verified 2026-10-19) | This plan |
|---|---|---|---|
| H1 s5 | Clear queue → **confirmation dialog**, then empty | `clearQueue()` fires immediately, no dialog | BUILD |
| N1 | Remove playing item → plays next, removes from queue | `removeItem` clamps index but engine auto-advance keys on `currentIndex` CHANGES only — the removed episode's already-resolved stream keeps playing | BUILD |
| E1 | Drag to same position → no change | `onDrop` guards `dragIndex !== index` — correct, untested | TEST (e2e) |
| E3 | Shuffle → randomizes order | `nextTrack` picks a random index per advance (shuffle-as-random-pick) | TEST (seeded) |
| E4 | Repeat modes cycle | `cycleRepeat` off→all→one on PlayerScreen; slice `nextTrack` honors `all`/`one` at end | TEST |
| E2 | Drag from feed to queue | Feed cards have queue BUTTONS only; feed (`/feed`) and queue (`/queue`) are separate routes — no simultaneously-visible drop target | DEFER (design) |
| E5 | Audio-only mode shows only audio items | `audioOnlyMode` feeds `QueueEmptyState` copy only; "filter view" vs "playback preference" semantics undecided | DEFER (design) |
| E6 | Mobile drag handle | Visual/responsive | DEFER (out of mock-e2e scope) |

**Evidence (live, verified this session):**
- `src/store/slices/queueSlice.ts` — `removeItem` (:63-68) filters + repositions, clamps
  `currentIndex` to `min(currentIndex, length-2)`; `nextTrack` (:107-121) honors shuffle /
  repeat; no queue-specific unit test file exists.
- `src/components/PlayerProvider.tsx` — auto-advance effect guards on
  `currentIndex === lastIndexRef.current` (index-identity only).
- `src/components/screens/QueueScreen.tsx` — Clear button calls `clearQueue()` directly;
  audio-only checkbox exists; per-item remove buttons exist.
- `src/components/screens/PlayerScreen.tsx` — shuffle toggle (:182) + `cycleRepeat` (:71-73,
  aria-label `Repeat: <mode>` at :233).
- `src/components/ui/Modal.tsx` — `variant?: 'confirmation'` exists; reuse, do not fork.
- e2e/f05-queue.spec.ts — covers H1 minus the confirmation step, with an explicit deviation
  note about drag-from-feed.

**Hard constraints / non-goals:**
- D1 (queue-add never streams), D4 (queue is local Zustand state) unchanged.
- Do NOT change `nextTrack`'s shuffle semantics (random-pick is a legitimate design; the
  plan-of-record's "randomizes order" is tested as observable behavior, not reimplemented).
- No new dependencies. No backend work (queue is frontend-first; commands stay mirrored).
- E2/E5/E6 are OUT of scope; each deferral must be visible in this file's Status at wrap.

**Authority matrix:** read/inspect = allowed; edit repo files = allowed (owner's full-auto
standing order); commit by path with model trailers = allowed; push/tag/release = PROHIBITED
(local-only repo, no remote). No installs needed. No live services touched; Playwright runs
its own dev server; the owner's `npm run tauri:dev` background task must not be disturbed.

**Acceptance criteria:** all four build/test items green under `npx vitest run` +
`npx playwright test`; each new behavior has a mutation-checked discriminating test; e2e
f05 updated to cover the confirmation dialog; deferrals documented here and in the P3
waypoint; commits carry `Co-Authored-By: Claude Opus 5.5` + `Co-Authored-By: GLM 5.3`.

## Phases

### Phase 1 — N1 remove-playing-item (engine + slice, TDD)
- RED: engine test — playing item at index 0 of 2, `removeItem(playing)` → engine advances
  to the (new) current episode and streams it; removing a NON-playing item does not interrupt.
- Implementation: PlayerProvider auto-advance effect must react to the current episode's
  IDENTITY, not just the index number (key on `items[currentIndex]?.episode?.id`); slice
  clamp already points `currentIndex` at the next item. Keep D2: no stream on ADD.
- Discriminant: revert the effect key change → RED returns.

### Phase 2 — H1 clear-queue confirmation (UI, TDD)
- RED: unit — click "Clear queue" → dialog visible with item count; Cancel keeps items;
  Confirm clears. e2e — extend f05-H1's clear step to pass through the dialog.
- Implementation: `Modal variant="confirmation"`; focus handling per Modal's own contract.
- Discriminant: bypass the dialog (wire Clear straight to clearQueue) → both RED.

### Phase 3 — E3/E4 repeat + shuffle pins (slice unit tests)
- Seeded `Math.random` for shuffle determinism (restore in finally).
- 'all' wraps past end; 'one' stays; 'off' stops; shuffle lands on the seeded index.
- Discriminant: break one branch of `nextTrack` → its pin fails.

### Phase 4 — E1 e2e no-op drag + regression + docs
- e2e: drag handle onto its own item → order unchanged.
- Full regression: vitest, tsc, build, playwright (all), cargo.
- Update this Status → DONE with receipts; append P3 waypoint; independent adversarial
  review dispatch (quality, per owner's standing guidance), triage + fix forward.

## 🧨 Adversarial review (pre-written risks)

- **Confirmation dialog breaks the existing f05 spec** (it asserts clear→empty in one step)
  → update the spec in the same phase; the deviation note goes away with the dialog.
- **Effect re-key fires on unrelated item edits** (e.g. setPlayMode re-creating episode
  objects) → key on episode ID only, compare against the last-PLAYED id, not object identity;
  mutation-check that a play-mode edit does NOT restart playback.
- **removeItem at end-of-queue** (remove last item while playing it) → clamp yields the
  previous item; pin it as intended behavior (there is no next).
- **Seeded Math.random leaks across tests** → restore in `finally`.

## Final review checklist

Receipts pasted per phase; deferrals named; D1/D2/D4 unchanged; no `git add -A`; owner's
tauri:dev task untouched; push/tag never attempted.
