# Execution Plan — 2b: Accessibility

_Authoring date: 2026-10-21 (overnight run, after 2a). Roadmap parent: step 2b:
"keyboard use, focus order, contrast, reduced motion, and screen-reader
labels."_

### 🚨 System instructions

Same rules as 1b–2a (receipts, commit by path, both attribution trailers,
push-prohibited). Test-first where the instrument allows: axe and keyboard
tests are the failing tests here — each new scan started RED against a real
violation and was fixed to GREEN, and each guard was mutation-checked.

### Discovery findings (verified live, 2026-10-21)

1. The axe gate covered only 3 surfaces (feed, settings-default-tab,
   player). 8 routes and 6 settings tabs were unscanned — which is exactly
   how an inert theme control and raw-palette instance badges survived to
   2a: unaudited surfaces.
2. Already in place (verified, not assumed): global `:focus-visible` ring
   with reduced-motion handling (`src/index.css`), 99 `aria-label` sites, a
   modal focus-trap test, and 2a's measured contrast fixes (which this
   milestone's axe run re-checks on every scanned surface).

### Phases (receipts)

1. **Extend the axe gate to every route and every Settings tab — DONE.**
   `e2e/axe-scans.spec.ts`: 3 → 15 axe tests (7 routes + 7 tabs + the
   original combined one). Each route asserts its own heading first, so a
   broken route fails loudly instead of scanning a redirect. First run found
   FOUR real defects (the scans were RED for the right reason):
   - `/search` had **no heading at all** — a screen-reader navigation dead
     end (the assertion `heading /^Search$/` failed, i.e. the test caught
     the gap it was written to catch).
   - The Search input had **no accessible name** (placeholder only).
   - The Downloads filter `<select>` had **no accessible name**
     (axe `select-name`, critical).
   - The Settings content `<div class="overflow-auto p-4">` was **not
     keyboard-focusable** (axe `scrollable-region-focusable`, serious) —
     keyboard users could not scroll it.
   Fixed: an `<h1>Search</h1>` (+ aria-label on the input), aria-label on the
   downloads filter, and `role="region" aria-label tabIndex={0}` on the
   scroll container. All 15 scans green.
2. **Keyboard traversal + focus visibility — DONE.**
   `e2e/keyboard-nav.spec.ts` (2 tests): six Tab presses each land on an
   element that is natively interactive or bears an interactive ARIA role
   (never `<body>`); and the first Tab stop must paint the **brand ring
   colour**, not merely "some" indicator.
   Mutation-check honesty: the first version of the focus assertion passed
   with the global ring DELETED — Chromium's default outline satisfied a
   bare "an outline exists" check. The assertion now requires
   `rgb(16, 240, 168)` (ring-focus-ring) in the computed box-shadow, and the
   same mutation (ring removed) turns it RED. That false-pass is the reason
   the colour check exists, and it is recorded here rather than quietly
   fixed.
3. **Gates — DONE.** Playwright 24/24 (15 axe + 2 keyboard + the original
   8 → includes modal focus trap), vitest 119/119, tsc clean.

### Recorded, not fixed here (with owners)

- Reduced motion: the global media query covers animations/transitions and
  the CA filters (index.css) — verified by reading, not re-tested; a
  reduced-motion Playwright profile would be the next step if a violation is
  ever suspected.
- Screen-reader labels: coverage is already broad (99 sites); no unnamed
  control surfaced in the scanned surfaces. The two unnamed ones found here
  (Search input, Downloads filter) are fixed.
- Voice-over-level review (live region announcements for toasts, queue
  changes) is beyond static analysis — recorded as a candidate for the 4g
  wider-testing pass with real users.

### Non-goals

A full WCAG audit (axe covers ~57 rules; manual expert review is a later
step), light-theme work (2a recorded: no light palette exists), mobile/iOS.
