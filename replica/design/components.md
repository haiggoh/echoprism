# EchoPrism v2.0 Component Specifications

Generated from `replica/recon.md` Step 5 components + design tokens.
Each component maps to S-IDs from the recon screen inventory.

---

## 1. PrismConvergeToggle

**The core interaction** — two beams (Audio=Amber, Video=Cyan) converge into one Unified=Emerald beam.

```
PrismConvergeToggle
  variants  unified, audio, video
  sizes     sm (32px), md (40px), lg (48px)
  states    default, hover, active, focus-visible, disabled, loading
  tokens    bg surface, border border-input, accent stream-unified, ca-warm, ca-cool, radius md, spring motion
  a11y      role="radiogroup", aria-label="Playback format", keyboard arrow keys, visible focus ring (converge glow), loading keeps label
  used on   S03, S04, S05, S14, S15, S08
```

**Behavior:**
- `unified` state: all three beams visible (amber top, cyan bottom, emerald right)
- `audio` state: cyan beam dimmed (0.2), emerald becomes amber
- `video` state: amber beam dimmed (0.2), emerald becomes cyan
- Animation: converge 400ms spring, emerge 400ms spring delayed 200ms

---

## 2. EpisodeCard

```
EpisodeCard
  variants  video, audio, smart-link
  sizes     default (feed), compact (queue), expanded (detail)
  states    default, hover, playing, queued, downloaded, loading, error, empty
  tokens    bg surface, border border, text text, text-muted text-muted, accent stream-unified, radius md, shadow card
  a11y      article, h3 title, time datetime, button play (aria-label), keyboard focus, screen reader announces format
  used on   S02, S06, S07, S12
```

**Format indicators:**
- Video: cyan accent bar (left), play icon
- Audio: amber accent bar, waveform icon
- Smart Link: emerald accent bar, link icon + both format icons

---

## 3. ChannelCard

```
ChannelCard
  variants  subscribed, not-subscribed
  sizes     default (feed), compact (search), expanded (channel page)
  states    default, hover, subscribed, loading, error
  tokens    bg surface, border border, text text, text-muted text-muted, accent stream-unified, radius md
  a11y      article, h3 title, button subscribe (aria-pressed), avatar with alt, keyboard focus
  used on   S02, S06, S07
```

---

## 4. QueueItem

```
QueueItem
  variants  video, audio, smart-link
  sizes     default, compact (mini-player)
  states    default, playing, queued, dragging, audio-mode, video-mode, smart-link-active
  tokens    bg surface/playing=accent-soft, border-left 3px (unified/audio/video), text text, radius md, motion base
  a11y      li in ol, button drag-handle (aria-label), button remove (aria-label), position announced, live region for playing
  used on   S05, S15
```

**Format-specific:**
- Playing: emerald left border + accent-soft background
- Audio-mode: amber left border
- Video-mode: cyan left border

---

## 5. InstanceCard

```
InstanceCard
  variants  healthy, degraded, failed, testing
  sizes     default (list), expanded (details), compact (dashboard)
  states    default, testing, selected, expanded, pinned
  tokens    bg surface, border border (health color), text text, text-muted text-muted, accent stream-unified, radius md, shadow card
  a11y      article, status badge (aria-live), button test (aria-label), button failover (aria-label), expanded details region
  used on   S09, S17
```

**Health colors:**
- Healthy: success (emerald)
- Degraded: warning (amber)
- Failed: danger (red)

---

## 6. EpisodeLinkBadge (Smart Episode Link)

```
EpisodeLinkBadge
  variants  high-confidence (auto), low-confidence (auto), manual
  sizes     default, compact (inline in episode card)
  states    default, hover, click-to-switch, switching, conflict
  tokens    bg accent-soft, border stream-unified, text text, accent stream-unified, radius pill, ca-warm, ca-cool
  a11y      button, aria-label="Switch to audio/video version", keyboard Enter/Space, tooltip on hover, confidence announced
  used on   S03, S04, S11, S18
```

**Visual:**
- Inline flex: audio icon (amber) + video icon (cyan) + link icon (emerald)
- High confidence: solid border, full opacity
- Low confidence: dashed border, 0.6 opacity
- Hover: shows "Switch to audio" / "Switch to video" tooltip

---

## 7. InstanceHealthGrid

```
InstanceHealthGrid
  variants  healthy, degraded, failed
  sizes     default (grid), compact (list)
  states    default, testing, manual-failover, pinned
  tokens    bg surface, border border, text text, accent stream-unified, radius md, shadow card
  a11y      table/grid, column headers, status cells with aria-label, button test, keyboard navigation
  used on   S17
```

---

## 8. QueueDragHandle

```
QueueDragHandle
  variants  default, dragging
  sizes     default (24x24), compact (20x20)
  states    default, dragging, drop-target, disabled
  tokens    bg surface-hover, text text-muted, accent stream-unified, radius sm, motion fast
  a11y      button, aria-label="Drag to reorder", aria-grabbed, keyboard Space to pick up, arrows to move, Enter to drop, Escape to cancel
  used on   S05
```

---

## 9. MiniPlayer (Persistent)

```
MiniPlayer
  variants  collapsed, expanded
  sizes     collapsed (72px height), expanded (160px height)
  states    playing, paused, hidden, audio-only, video-only
  tokens    bg surface, border-t border, text text, text-muted text-muted, accent stream-unified, shadow pop, motion base
  a11y      region aria-live="polite", button play/pause, button next/prev, button expand, progress bar (slider), artwork alt
  used on   S15 (persistent across all screens)
```

---

## 10. DownloadButton

```
DownloadButton
  variants  video, audio, quality-selector
  sizes     default (32px), compact (24px), with-label
  states    default, downloading (progress), downloaded, failed, queued
  tokens    bg surface, border border, text text, accent stream-unified, radius md, motion base
  a11y      button, aria-label includes format/quality, progress announced (aria-valuenow), failed state announced
  used on   S03, S04, S13
```

---

## 11. SponsorBlockMarker

```
SponsorBlockMarker
  variants  sponsor, selfpromo, interaction, intro, outro, preview, poi_highlight, chapter
  sizes     timeline-marker (4px), chapter-marker (8px)
  states    visible, skipped, hidden, current
  tokens    bg category-color, text on-category, radius sm (timeline) / md (chapter)
  a11y      button (timeline), section (chapter), aria-label includes category, keyboard navigation, screen reader announces skip
  used on   S14
```

**Category colors mapped to stream palette:**
- Sponsor: amber (stream-audio)
- Selfpromo: amber-soft
- Interaction: cyan (stream-video)
- Intro: emerald-soft
- Outro: emerald
- Preview: cyan-soft
- POI: amber
- Chapter: emerald

---

## 12. ChapterMarker

```
ChapterMarker
  variants  video, audio
  sizes     timeline (4px), list (full-width)
  states    default, current, hovered, clicked
  tokens    bg surface, border border, text text, accent stream-unified, radius sm
  a11y      button (timeline), li (list), aria-current="step", keyboard arrows, screen reader announces title/time
  used on   S03, S04, S14
```

---

## 13. Waveform

```
Waveform
  variants  static (pre-rendered), live (real-time)
  sizes     full (player), mini (queue item), thumbnail (card)
  states    static, playing, seeking, loading
  tokens    bg surface, fill stream-unified, fill-muted stream-audio/video, radius sm, motion fast
  a11y      canvas/img with alt, role="img", aria-label="Audio waveform", static version for reduced-motion
  used on   S04, S14, S15
```

---

## 14. ConvergenceLoader

```
ConvergenceLoader
  variants  beams (default), pulse (inline), spinner (compact)
  sizes     full (screen), inline (button), compact (24px)
  states    beams-traveling, merging, emerging, complete
  tokens    bg surface, beam-audio stream-audio, beam-video stream-video, beam-unified stream-unified, motion converge/emerge
  a11y      role="status", aria-label="Loading", aria-busy="true", prefers-reduced-motion disables animation, text fallback
  used on   S01, S14, loading states
```

---

## 15. ConvergenceCA (Chromatic Aberration)

```
ConvergenceCA
  variants  subtle, hover, focus, playing
  sizes     applied to thumbnails/media
  states    default, hover, focus-visible, playing
  tokens    ca-warm stream-audio, ca-cool stream-video, accent stream-unified
  a11y      prefers-reduced-motion disables filter, never on text, focus visible without CA
  used on   Thumbnails, episode cards, media elements
```

**Filter values:**
- Subtle: 0.5px offset warm/cool
- Hover: 1px offset + emerald glow
- Focus: 2px offset + emerald glow 12px
- Playing: emerald glow 12px (no offset)

---

## 16. ConvergenceBeam

```
ConvergenceBeam
  variants  audio, video, unified
  sizes     full (onboarding), compact (toggle), inline (button)
  states    traveling, merging, emerging
  tokens    stream-audio, stream-video, stream-unified, motion converge/emerge/spring
  a11y      decorative (aria-hidden), text describes state, prefers-reduced-motion simplifies
  used on   S01, S14, loading, PrismConvergeToggle
```

---

## 17. QueueEmptyState

```
QueueEmptyState
  variants  default, audio-mode
  sizes     full-screen, inline (mini-player)
  states    default, with-cta
  tokens    bg surface, text text-muted, accent stream-unified, stream-audio, stream-video, radius lg, shadow card
  a11y      section, heading, paragraph, button CTA (emerald), keyboard focus
  used on   S05
```

**Content:**
- Default: Prism outline, two beams entering (amber top, cyan bottom), no exit beam
- Copy: "Add a channel to start the convergence"
- CTA: "Browse Channels" (btn-unified)

---

## 18. FeedFilterTabs

```
FeedFilterTabs
  variants  all, video, podcast, queue
  sizes     default, compact (mobile)
  states    active, inactive, disabled, loading
  tokens    bg surface, border border, text text/text-muted, accent stream-unified, radius pill, motion fast
  a11y      tablist, tab role, aria-selected, aria-controls, keyboard arrows, indicator animates
  used on   S02, S07
```

---

## 19. InstanceHealthBar

```
InstanceHealthBar
  variants  latency (bar), health (pill)
  sizes     default (200px), compact (100px)
  states    healthy (emerald), degraded (amber), failed (red), testing (pulse)
  tokens    bg surface, fill health-color, text text-subtle, radius sm, motion fast
  a11y      progressbar, aria-valuemin/max/now, aria-label includes latency/health
  used on   S09, S17
```

---

## 20. KeyboardShortcutRow

```
KeyboardShortcutRow
  variants  category-header, shortcut
  sizes     default, compact
  states    default, hover, editing, conflict
  tokens    bg surface, border border, text text, text-muted text-subtle, accent stream-unified, radius sm
  a11y      dl/dt/dd, kbd for keys, button edit (aria-label), button reset
  used on   S16
```

---

## 21. ConvergenceEmptyState (Onboarding/Feed)

```
ConvergenceEmptyState
  variants  onboarding, no-subscriptions, no-results, offline
  sizes     full-screen, inline
  states    default, with-cta, with-illustration
  tokens    bg bg, text text-muted, accent stream-unified, stream-audio, stream-video, ca-warm, ca-cool, radius lg
  a11y      section, heading, paragraph, button CTA, illustration decorative (aria-hidden)
  used on   S01, S02
```

---

## 22. ConvergenceLoading

```
ConvergenceLoading
  variants  beams (full), pulse (inline), skeleton (card)
  sizes     full-screen, card, inline
  states    beams-traveling, merging, emerging, skeleton
  tokens    bg surface, beam-audio, beam-video, beam-unified, motion converge/emerge, skeleton uses surface-hover
  a11y      role="status", aria-label="Loading", skeleton has no animation for reduced-motion
  used on   S01, S14, S02, S06, S07
```

---

## 23. Button (Base Primitive)

```
Button
  variants  unified (primary), audio, video, ghost, danger, secondary
  sizes     sm (32px), md (40px), lg (48px), icon (32x32)
  states    default, hover, active, focus-visible (2px ring accent), disabled, loading
  tokens    bg per variant, text per variant, border per variant, radius md, font sm/600, motion base
  a11y      real <button>, visible focus ring, loading keeps label (aria-busy), disabled aria-disabled
  used on   All screens
```

**Variant tokens:**
- Unified: bg accent, text on-accent, border accent
- Audio: bg transparent, border stream-audio, text stream-audio, hover bg stream-audio text bg
- Video: bg transparent, border stream-video, text stream-video, hover bg stream-video text bg
- Ghost: bg transparent, text text, hover bg surface-hover
- Danger: bg danger, text white
- Secondary: bg surface, border border, text text

---

## 24. Input / Select

```
Input
  variants  text, search, select, textarea
  sizes     sm (32px), md (40px), lg (48px)
  states    default, hover, focus (ring accent), error (ring danger), disabled, filled
  tokens    bg bg, border border-input (focus: accent), text text, placeholder text-subtle, radius md, motion fast
  a11y      label (for=id), aria-describedby error/help, aria-invalid, autocomplete
  used on   S01, S07, S08, S09, S10, S11
```

---

## 25. Modal / Dialog

```
Modal
  variants  default, confirmation, form, full-screen (mobile)
  sizes     sm (400px), md (560px), lg (720px), full
  states    closed, opening, open, closing, loading
  tokens    bg surface, border border, shadow pop, radius lg, motion base (backdrop 200ms)
  a11y      role="dialog", aria-modal="true", aria-labelledby, aria-describedby, focus trap, Escape closes, focus return
  used on   S01, S08, S09, S10, S11, S13
```

---

## Design Token Count Summary

| Category | Count |
|----------|-------|
| Colors | 30 |
| Color Pairs | 20 |
| Typography | 3 fonts + 6 type scales |
| Spacing | 9 values (4px base) |
| Radius | 4 values |
| Shadows | 4 values |
| Motion | 9 values |
| **Total** | **~85 tokens** |

---

## Next Step

`/replica-build` — Build the primitives in isolation (Storybook or `/design` route), screenshot them, then build screens S01→S18.