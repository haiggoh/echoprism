# EchoPrism Component Specifications

**Design System:** Convergence (Amber + Cyan → Emerald)
**Primitives built in:** `/design` route (isolated, before screens)

---

## Button

**Variants:** `unified`, `audio`, `video`, `ghost`, `danger`
**Sizes:** `sm` (32px), `md` (40px), `lg` (48px)
**States:** `default`, `hover`, `active`, `focus-visible`, `disabled`, `loading`

**Tokens:**
- `unified`: `bg=accent`, `text=text-inverse`, `radius=md`, `font=sm/600`
  - Hover: `bg=accent-hover`, convergence line (2px gradient: audio→unified→video)
- `audio`: `bg=transparent`, `border=audio`, `text=audio`, `radius=md`
  - Hover: `bg=audio`, `text=text-inverse`, pulse glow
- `video`: `bg=transparent`, `border=video`, `text=video`, `radius=md`
  - Hover: `bg=video`, `text=text-inverse`, pulse glow
- `ghost`: `bg=transparent`, `text=text`, `radius=md`
  - Hover: `bg=surface-hover`
- `danger`: `bg=danger`, `text=text-inverse`, `radius=md`
  - Hover: `bg=danger-hover`

**Focus-visible:** `outline: 2px solid focus-ring`, `outline-offset: 2px`
**Disabled:** `opacity=0.5`, `cursor=not-allowed`
**Loading:** Spinner (convergence beams), keeps label for screen readers

**A11y:** Real `<button>`, visible focus, `aria-busy` when loading, `aria-disabled` when disabled

**Used on:** S01, S02, S03, S04, S05, S06, S07, S08, S09, S10, S11, S13, S14, S15, S16, S17, S18

---

## PrismConvergeToggle (Core Component)

**Variants:** `prism-converge` (animated), `audio-video` (simple)
**Sizes:** `sm` (28px), `md` (40px), `lg` (56px)
**States:** `unified`, `audio`, `video`, `disabled`, `loading`

**Anatomy:**
```
[Beam Audio] → [Prism] → [Beam Unified] ← [Beam Video]
   (amber)      (triangle)    (emerald)      (cyan)
```

**Tokens:**
- `beam-audio`: `stroke=stream-audio`, `stroke-width=2`
- `beam-video`: `stroke=stream-video`, `stroke-width=2`
- `beam-unified`: `stroke=stream-unified`, `stroke-width=3`
- `prism`: `fill=transparent`, `stroke=border`, `stroke-width=1.5`, subtle refraction glow

**Animations:**
- `unified`: Two beams converge (400ms spring) → pulse at center (emerald, 800ms) → single beam emerges (400ms spring, delayed 200ms)
- `audio-only`: Video beam fades (200ms), unified beam becomes amber
- `video-only`: Audio beam fades (200ms), unified beam becomes cyan
- `loading`: Beams travel → prism center (600ms linear loop) → pulse at center

**States:**
- `unified`: All beams visible, emerald unified beam
- `audio`: Video beam dimmed (opacity 0.2), unified beam = amber
- `video`: Audio beam dimmed (opacity 0.2), unified beam = cyan
- `disabled`: All opacity 0.5, no animation
- `loading`: Beams traveling → center pulse loop

**A11y:** Real `<button>` with `aria-pressed` for each mode, `aria-label` describes current mode, keyboard navigable (Arrow keys switch mode), screen reader announces mode change

**Used on:** S03, S04, S05, S14, S15

---

## EpisodeCard

**Variants:** `video`, `audio`, `smart-link`
**States:** `default`, `hover`, `playing`, `queued`, `downloaded`, `audio-mode`

**Anatomy:**
```
[Thumbnail (16:9)] [Duration badge]
[Title (2 lines max)]
[Channel name + metadata]
[Format badges: Video/Audio/SmartLink]
[Queue actions: Play next / Add to end]
[Smart Link badge (if matched)]
```

**Tokens:**
- `bg=surface`, `border=border`, `radius=lg`
- `hover`: `border=border-strong`, `shadow=md`
- `playing`: `border=accent`, `bg=accent-soft`
- `audio-mode`: `border=audio`, `bg=audio-soft`
- `queued`: `opacity=0.7`
- `downloaded`: `downloaded-badge` (success color)

**Smart Link Badge:**
- `high-confidence` (≥0.8): `bg=accent-soft`, `text=accent`, icon=link-check
- `low-confidence` (0.5-0.8): `bg=warning-soft`, `text=warning`, icon=link-question
- `manual`: `bg=audio-soft`, `text=audio`, icon=link-manual

**A11y:** Article wrapper, thumbnail alt text = title, duration read as "X minutes Y seconds", format badge has `aria-label`, Smart Link badge announces "Audio version available" / "Video version available"

**Used on:** S02, S06, S07, S12

---

## ChannelCard

**Variants:** `subscribed`, `not-subscribed`
**States:** `default`, `hover`, `subscribed`, `loading`

**Anatomy:**
```
[Avatar (48px)]
[Title + handle]
[Subscriber count + type badge]
[Subscribe/Subscribed button]
```

**Tokens:**
- `bg=surface`, `border=border`, `radius=lg`
- `hover`: `border=border-strong`, `shadow=sm`
- `subscribed`: `bg=accent-soft`, button=ghost
- `loading`: skeleton animation

**A11y:** Avatar alt = channel title, button `aria-pressed` for subscribed state

**Used on:** S02, S06, S07

---

## QueueItem

**Variants:** `video`, `audio`, `smart-link`
**States:** `default`, `playing`, `queued`, `dragging`, `audio-mode`

**Anatomy:**
```
[Drag handle] [Thumbnail (16:9, 48px)] [Title] [Channel] [Duration] [Format badge] [Smart Link badge] [Remove]
```

**Tokens:**
- `bg=surface`, `border=border`, `radius=md`, `gap=12px`
- `playing`: `bg=accent-soft`, `border-left=3px solid accent`, title bold
- `audio-mode`: `border-left=audio`, `bg=audio-soft`
- `dragging`: `opacity=0.8`, `shadow=lg`, `rotate=2deg`
- `smart-link`: shows badge, click switches format

**Drag:** Native HTML5 DnD + custom ghost image (convergence beam), `aria-grabbed`, `aria-dropeffect`

**A11y:** `aria-grabbed`, `aria-dropeffect`, keyboard reorder (Space to grab, Arrows to move, Enter to drop), screen reader announces position

**Used on:** S05, S15

---

## InstanceCard

**Variants:** `healthy`, `degraded`, `failed`
**States:** `default`, `testing`, `selected`, `expanded`

**Anatomy:**
```
[Status indicator (pulse)] [URL] [Type badge] [Region] [Latency] [Health bar] [Actions]
```

**Tokens:**
- `healthy`: `status=success`, pulse animation (1000ms infinite)
- `degraded`: `status=warning`, pulse slow
- `failed`: `status=danger`, no pulse
- `testing`: pulse spinner overlay
- `selected`: `border=accent`, `bg=accent-soft`

**A11y:** Status announced on change, live region for health updates, keyboard expand/collapse (Enter/Space)

**Used on:** S09, S17

---

## EpisodeLinkBadge (Smart Link)

**Variants:** `matched`, `low-confidence`, `manual`
**States:** `default`, `hover`, `click-to-switch`

**Anatomy:**
```
[Icon] [Text: "Audio version available" / "Video version available"]
[Confidence: XX%]
```

**Tokens:**
- `high-confidence` (≥0.8): `bg=accent-soft`, `text=accent`, `border=accent`, icon=check-circle
- `low-confidence` (0.5-0.8): `bg=warning-soft`, `text=warning`, `border=warning`, icon=alert-circle
- `manual`: `bg=audio-soft`, `text=audio`, `border=audio`, icon=link-2

**Interactions:**
- Hover: shows tooltip "Switch to audio version" / "Switch to video version"
- Click: triggers format switch with position sync (300ms)
- Long press: opens Smart Link Manager (S18)

**A11y:** `aria-label` describes format switch, announces confidence, `role=button`, keyboard accessible

**Used on:** S03, S04, S11, S18

---

## InstanceHealthIndicator

**Variants:** `healthy`, `degraded`, `failed`
**States:** `default`, `pulse`, `testing`

**Tokens:**
- `healthy`: `color=success`, pulse (1000ms ease-in-out infinite)
- `degraded`: `color=warning`, pulse slow (2000ms)
- `failed`: `color=danger`, static
- `testing`: spinner overlay

**A11y:** Status announced via live region, tooltip shows latency ms

**Used on:** S09, S17, S03, S04

---

## ConvergenceLoader

**Variants:** `beams`, `spinner`, `skeleton`, `progress`
**States:** `default`, `converging`

**Beams Variant (Primary):**
```
[Beam Audio] → [Prism] → [Beam Unified] ← [Beam Video]
```

**Animation:** Beams travel (600ms linear) → converge at center (400ms spring) → pulse emerald (800ms) → single beam emerges (400ms spring)

**Tokens:** Uses beam colors (audio/video/unified), prism geometry, convergence glow

**Skeleton Variant:** Dark prism outline, beams as skeleton shimmer

**Progress Variant:** Emerald beam progress bar with convergence glow

**Used on:** S01, S14, loading states

---

## ConvergenceCA (Chromatic Aberration Component)

**Variants:** `subtle`, `hover`, `focus`, `playing`
**States:** Applied as filter to media elements

**CSS Filters:**
```css
/* Subtle (default) */
filter: drop-shadow(0.5px 0 var(--ca-warm)) drop-shadow(-0.5px 0 var(--ca-cool));

/* Hover */
filter: drop-shadow(1px 0 var(--ca-warm)) drop-shadow(-1px 0 var(--ca-cool)) drop-shadow(0 0 8px var(--stream-unified));

/* Focus */
filter: drop-shadow(2px 0 var(--ca-warm)) drop-shadow(-2px 0 var(--ca-cool)) drop-shadow(0 0 12px var(--stream-unified));

/* Playing */
filter: drop-shadow(0 0 12px var(--stream-unified));
```

**Meaning:** Red/warm offset = Audio half, Cyan/cool offset = Video half, Emerald glow = Unified

**Accessibility:** `prefers-reduced-motion: reduce` → `filter: none`

**Applied to:** Media thumbnails, episode thumbnails, player, focusable media

---

## ConvergenceBeam (Animated Beam)

**Variants:** `audio`, `video`, `unified`
**States:** `traveling`, `merging`, `emerging`

**SVG Path Animation:** `stroke-dashoffset` animation for beam travel

**Used on:** S01, S14, loading states

---

## QueueDragHandle

**Variants:** `default`, `dragging`
**States:** `default`, `dragging`, `drop-target`

**Tokens:** `bg=surface`, `border=border`, `radius=full`, `cursor=grab`
**Dragging:** `cursor=grabbing`, `opacity=0.8`, `shadow=lg`
**Drop target:** `border=accent`, `bg=accent-soft`

**A11y:** `aria-grabbed`, `aria-dropeffect`, keyboard reorder (Space grab, Arrows move, Enter drop)

**Used on:** S05

---

## SmartLinkBadge

**Variants:** `high-confidence`, `low-confidence`, `manual`
**States:** `default`, `hover`, `click`

**Tokens:**
- `high-confidence` (≥0.8): `bg=accent-soft`, `text=accent`, `border=accent`, icon=check
- `low-confidence` (0.5-0.8): `bg=warning-soft`, `text=warning`, `border=warning`, icon=alert
- `manual`: `bg=audio-soft`, `text=audio`, `border=audio`, icon=link-2

**Interactions:** Hover tooltip, click = format switch with position sync (300ms), long press = open manager

**Used on:** S03, S04, S11, S18

---

## InstanceHealthIndicator

**Variants:** `healthy`, `degraded`, `failed`
**States:** `default`, `pulse`, `testing`

**Tokens:**
- `healthy`: `color=success`, pulse (1000ms ease-in-out infinite)
- `degraded`: `color=warning`, pulse slow (2000ms)
- `failed`: `color=danger`, static
- `testing`: spinner overlay

**A11y:** Live region for status changes, tooltip with latency ms

**Used on:** S09, S17, S03, S04

---

## QueueDragHandle

**Variants:** `default`, `dragging`
**States:** `default`, `dragging`, `drop-target`

**Tokens:** `bg=surface`, `border=border`, `radius=full`, `cursor=grab`
**Dragging:** `cursor=grabbing`, `opacity=0.8`, `shadow=lg`
**Drop target:** `border=accent`, `bg=accent-soft`

**A11y:** `aria-grabbed`, `aria-dropeffect`, keyboard reorder (Space grab, Arrows move, Enter drop)

**Used on:** S05

---

## QueueEmptyState

**Variants:** `default`, `audio-mode`
**States:** `default`, `with-cta`

**Tokens:** `bg=surface`, `border=border`, `radius=lg`, `padding=xl`
**Content:** Convergence prism illustration + copy + CTA button

**Copy:**
- Default: "No channels added. Import or search to start."
- Audio mode: "Queue is empty. Pick from feed → Play next / Add to end"

**Used on:** S05

---

## FeedFilterTabs

**Variants:** `feed-filter`, `channel`, `settings`
**States:** `active`, `inactive`, `disabled`

**Tokens:** `bg=transparent`, `border-bottom=2px` (active=accent), `text=text` (inactive=text-muted), `radius=md` (top only)

**A11y:** `role=tablist`, `aria-selected`, `aria-controls`, keyboard navigation (Arrows)

**Used on:** S02, S07

---

## InstanceHealthBar

**Variants:** `latency`, `health`
**States:** `healthy`, `degraded`, `failed`

**Tokens:**
- `healthy`: `bg=success`, width=latency-based
- `degraded`: `bg=warning`
- `failed`: `bg=danger`
- Animated width transition (300ms ease-out)

**Used on:** S09, S17

---

## KeyboardShortcutRow

**Variants:** `category`, `shortcut`
**States:** `default`, `hover`

**Tokens:** `bg=surface`, `border=border`, `radius=md`, `gap=12px`
**Content:** Category label + key combination (kbd) + description

**A11y:** `kbd` element for keys, copy button with tooltip "Copied!"

**Used on:** S16

---

## ConvergenceBeam (Animated SVG)

**Variants:** `audio`, `video`, `unified`
**States:** `traveling`, `merging`, `emerging`

**SVG Animation:** `stroke-dashoffset` animation along prism path

**Used on:** S01, S14, loading states

---

## Tooltip

**Variants:** `default`, `smart-link`, `shortcut`
**Positions:** `top`, `bottom`, `left`, `right`

**Tokens:** `bg=bg-elevated`, `text=text`, `radius=md`, `shadow=lg`, `padding=8px 12px`
**Animation:** 150ms ease-out fade + slide (8px)

**A11y:** `role=tooltip`, `aria-describedby`, hides on Escape, delays (show 200ms, hide 100ms)

---

## Modal

**Sizes:** `sm` (400px), `md` (560px), `lg` (720px), `xl` (960px), `full`
**States:** `open`, `closing`

**Tokens:** `bg=bg-elevated`, `border=border`, `radius=xl`, `shadow=2xl`, `backdrop=bg-overlay`
**Animation:** 200ms ease-out scale (0.95→1) + fade

**A11y:** `role=dialog`, `aria-modal=true`, `aria-labelledby`, focus trap, Escape closes, focus restore on close

---

## Dropdown

**Variants:** `default`, `filter`, `actions`
**States:** `open`, `closing`

**Tokens:** `bg=bg-elevated`, `border=border`, `radius=md`, `shadow=lg`, `min-width=200px`
**Animation:** 150ms ease-out fade + slide (4px)

**A11y:** `role=menu`, `aria-expanded`, `aria-controls`, keyboard nav (Arrows, Enter, Escape)

---

## Tabs

**Variants:** `feed-filter`, `channel`, `settings`
**States:** `active`, `inactive`, `disabled`

**Tokens:** `bg=transparent`, `border-bottom=2px` (active=accent), `text=text` (inactive=text-muted), `radius=md` (top only), `padding=12px 16px`

**A11y:** `role=tablist`, `role=tab`, `aria-selected`, `aria-controls`, keyboard nav (Arrows, Home, End)

---

## Table

**Variants:** `default`, `queue`, `history`, `instances`
**States:** `default`, `sorting`, `loading`, `empty`

**Tokens:** `bg=surface`, `border=border`, `radius=lg`, `overflow=auto`
**Header:** `bg=bg-elevated`, `text=text-muted`, `font=semibold`
**Row hover:** `bg=surface-hover`
**Sorting:** Click header → accent arrow icon

**A11y:** `scope=col`, `aria-sort`, keyboard sort (Enter/Space)

---

## List

**Variants:** `default`, `queue`, `history`, `downloads`, `episodes`
**States:** `default`, `loading`, `empty`, `reordering`

**Tokens:** `gap=12px` (default), `gap=8px` (dense)
**Empty:** EmptyState component
**Loading:** Skeleton items (convergence beam shimmer)
**Reordering:** Drag ghost + drop targets

**A11y:** `role=list`, `aria-label`, keyboard reorder

---

## EmptyState

**Variants:** `feed`, `queue`, `search`, `history`, `downloads`, `onboarding`
**States:** `default`, `with-cta`

**Tokens:** `bg=surface`, `border=border`, `radius=xl`, `padding=2xl`, `text-center`
**Illustration:** Convergence prism (feed), calm water (queue), magnifying glass (search), clock (history), download arrow (downloads), prism + beams (onboarding)
**Copy per variant:**
- Feed: "No channels added. Import or search to start." → CTA: "Browse Channels"
- Queue: "Pick from feed → Play next / Add to end" → CTA: "Go to Feed"
- Search: "No results for '{query}'. Try different terms."
- History: "Nothing played yet. Start watching or listening."
- Downloads: "No downloads yet. Tap download on any episode."
- Onboarding: "Welcome to EchoPrism. Two streams become one." → CTA: "Get Started"

---

## Loading

**Variants:** `convergence`, `spinner`, `skeleton`, `progress`
**States:** `default`, `converging`

**Convergence (Primary):** Full PrismConverge animation (beams → converge → emerge)
**Spinner:** Emerald ring with convergence glow pulse
**Skeleton:** EpisodeCard/ChannelCard shapes with convergence beam shimmer
**Progress:** Emerald beam progress bar with convergence glow

---

## Contrast Report Summary

All 18 text/background pairs pass WCAG AA (4.5:1 normal, 3:1 large/UI):
- Text on bg/bg-elevated/surface: AAA (13-16:1)
- Text-muted on bg/bg-elevated/surface: AA (4.5-5.5:1)
- Text-inverse on accent/audio/video/danger/success/warning: AAA (8-13:1)
- Accent/audio/video/danger/focus-ring on bg: AAA/AA (5-13:1)

**Zero AA failures.**
