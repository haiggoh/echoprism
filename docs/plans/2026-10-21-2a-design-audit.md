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
