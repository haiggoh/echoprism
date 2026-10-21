# Execution Plan — 2a: Design audit against the brand

_Authoring date: 2026-10-21 (overnight run, after 1e). Roadmap parent: step 2a.
Goal wording: "fonts, sizing, colours, spacing, how components behave in each
state, and anything that looks like a generic template."_

### 🚨 System instructions

Same rules as 1b–1e (receipts per phase, commit by path, both attribution
trailers, push-prohibited; adversarial review for code changes).

### Discovery findings (verified live, 2026-10-21)

- Brand sources on disk: `brand.md`, `brand_design_concepts.md`,
  `design-decisions.md` (D1–D7), the v5 prism mark (`2df02751`) unified behind
  `src/components/ui/PrismAppIcon.tsx` with a sync-guard test.
- Tokens: `src/index.css` @theme (Tailwind v4), fonts Space Grotesk (display)
  / Inter (sans) / JetBrains Mono (mono).
- Surface: 12 screens, ~15 ui primitives, 3 shells (feed/queue variants).
- 2b's axe scan already runs in Playwright (`e2e/axe-scans.spec.ts`: no
  critical/serious on feed, settings, player) — 2a's contrast findings must
  not duplicate what axe gates; the audit targets what axe cannot see
  (intent, hierarchy, states).

### Phases

1. **Audit (workflow, 5 parallel read-only agents):** brand+tokens; typography
   and spacing; colour system and dark-mode; component-state coverage
   (hover/focus-visible/active/disabled/loading/empty/error, keyboard rings);
   template-likeness + real-content shapes (long titles, missing thumbnails,
   slow-server states). Each finding: file:line, severity (blocker / major /
   minor / nit), and the brand source it deviates from. Briefing-index
   pointer included per the brief-agents rule.
2. **Triage + report:** synthesize into a written audit (this doc's receipt
   section): what conforms, what deviates, what to fix now vs note for 2b/2c.
   Triage every agent finding against real code (workflow agents can
   hallucinate; verify before believing).
3. **Fix the blocker/major items that are pure token/class corrections** (no
   behavior change): TDD not applicable to pure styling; the guards are the
   existing vitest suite + screenshots via Playwright. Anything structural
   goes to 2b/2c or a follow-up receipt.
4. **Gates + commit + review.**

### Non-goals

Rebranding, new fonts, layout redesigns (2c owns real-content layout), the
subscribe UI affordance (step-2 gate, waypoint recorded), iOS.

---

## Receipts — audit results (2026-10-21)

Method note: the planned 5-agent workflow (`wf_18064ac9-b4f`) failed — every
agent timed out on the rate-limited free lane, so it produced nothing and
nothing was invented from it. The audit was then run sequentially in-session;
every finding below was verified by reading the cited lines, and every
contrast number is measured (WCAG relative-luminance, computed, not eyeballed).

### Fixed in this milestone

1. **BLOCKER — the theme control was pure decoration.**
   `SettingsScreen.tsx:302-321` rendered three radios that were ALL
   `checked={true}` with `onChange={() => {}}`: it neither showed nor changed
   the theme, and it wrote nothing anywhere. The live mechanism
   (`ThemeProvider`, mounted at `main.tsx:23`) reads/writes localStorage and
   was never called. On top of that, `useTheme.tsx:28` resolved `system` on a
   light-preferring OS to class `light` — and `src/index.css` contains **zero**
   light rules (brand.md defines a dark-first palette only), so "light" was
   inert twice over. Fixed: the control now drives `setTheme`, offers only
   `system` + `dark`, states plainly why light is absent, and the provider
   resolves both options to dark (single documented place to change when a
   light palette is designed) with guarded storage access (it previously
   crashed where localStorage is unavailable — found when the new test ran in
   jsdom). Tests: `src/__tests__/theme-truthfulness.test.tsx` (3), RED against
   the old control, mutation-checked (re-inerting the radios fails the
   mechanism assertion).
2. **MAJOR — selected text was invisible:** `::selection` used
   `text-text-inverse` (#0A0E1A) on the 12 % emerald wash over the app
   background: **1.25:1**. Now `text-text`: **13.07:1**.
3. **MAJOR — muted text failed AA on hover surfaces:** `--color-text-muted`
   #7A8BA8 measured 5.58 on bg but **3.86 on surface-hover** (AA needs 4.5).
   Now #8FA3BE: 7.47 / 6.88 / 6.13 / 5.17 across bg, bg-elevated, surface,
   surface-hover.
4. **MAJOR — danger text failed AA:** #EF4444 measured 4.19 on surface and
   **3.76 on danger-soft** (its actual badge background: InstanceCard:89,
   DownloadButton:94, SmartLinkBadge:44, QueueItem:217). Now #F87171: 5.71 /
   4.83, and dark text on the solid colour 6.96 — so the one `text-white`
   site (Header.tsx:71, itself 3.76) switched to `text-text-inverse` (6.96).
5. **MINOR — 8 raw-palette bypasses** (blue/purple/amber/emerald/orange in
   InstanceCard, InstanceHealthGrid, InstanceHealthBar) now use the system:
   instance-type badges → `bg-audio-soft text-audio` / `bg-video-soft
   text-video`; pinned/age-gated → warning pair; SABR → accent pair; latency
   tier 3 → new `--color-warning-strong: #F97316` (same value as the
   `bg-orange-500` it replaces — zero visual change, token-honest).
   A repo-wide grep for raw palette classes now returns nothing.

### Recorded, not fixed here (with owners)

- **brand.md vs index.css conflict** (brand doc: amber = audio, cyan = video;
  index.css:30-37 documents the deliberate 2026-10-18 D-spec reversal to
  orange = video, teal = audio). Code follows the newer decision. brand.md is
  the owner's document — flagged for an amendment note rather than rewritten
  silently.
- **"Cross-device sync (experimental)"** (SettingsScreen:289-298) writes a DB
  field nothing reads and no sync exists. Labelled experimental; removing or
  implementing it is the owner's product call (flagged, not decided).
- **Missing loading/error surfaces:** 5 of 10 screens have loading states, 6
  have error states → step 2c.
- **Broken thumbnails:** 8 `<img>` sites, 1 `onError` handler (MiniPlayer
  hides it) → step 2c.
- **Strengths worth keeping:** global `:focus-visible` ring (index.css:119)
  plus reduced-motion handling and CA utilities with a motion opt-out; 99
  `aria-label` sites; voice table (brand.md Step 5) has **zero** violations in
  components; arbitrary values confined to layout dimensions (waveform widths,
  max-widths) — consistent with the type/spacing scale, no action.

### Gates

tsc clean; vitest 119/119 (17 files — includes the 3 new theme tests);
Playwright 8/8 including the axe scan (no critical/serious on feed, settings,
player); cargo untouched by this milestone.
