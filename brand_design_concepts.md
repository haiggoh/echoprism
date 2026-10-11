# Brand Design Concepts: EchoPrism vs EchoCast vs ViewCast

**Documented:** 2026-10-11 (Updated 2026-10-11 v2.0 — EchoPrism redesigned for combination/unification)  
**Purpose:** Durable record of three fully developed brand design concepts for the unified YouTube + Podcast client with Smart Episode Linking.  
**Status:** All three are viable, conflict-free (no app store / GitHub conflicts), and ready for selection.

---

## Quick Reference: Final 12 Contenders → Top 3

| Name | Status | Conflict Check |
|------|--------|----------------|
| EchoPrism | **Top 3** | ✅ Clean (1 empty GitHub repo) |
| ViewCast | **Top 3** | ✅ Clean |
| EchoCast | **Top 3** | ✅ Clean (low-star unrelated) |
| PrismCast | Runner-up | 🟡 49-star Chrome streaming server |
| PrismLink | Runner-up | ✅ Clean |
| PrismTube | Runner-up | ✅ Clean |
| StreamCast | Runner-up | 🟡 31-star live streaming platform |
| EchoTube | Runner-up | 🟡 3-4 star direct competitor (YouTube client) |
| WatchLink | ❌ Avoid | 🔴 77-star Apple Watch messaging app |
| StreamEcho | Available | ✅ Clean (small projects) |
| EchoPrismTube | Available (3-word) | ✅ Zero conflicts |

---

## CONCEPT 1: EchoPrism v2.0 — "Two streams become one"

### Core Philosophy Shift
**The prism COMBINES, not splits.** 

Two distinct streams enter — **Audio/Podcast** (warm, organic) and **Video/YouTube** (cool, precise) — and the prism unifies them into **one coherent stream**. The user experiences a single flow where format becomes irrelevant.

> "Two streams enter. One stream exits. Your format, your choice."

### Logo / Mark

| Variant | Description |
|---------|-------------|
| **Primary** | Equilateral triangle prism. Two beams enter from left: **Warm Amber** (audio/podcast, from top-left) and **Cool Cyan** (video/YouTube, from bottom-left). They converge inside the prism. **One unified beam** exits right — **Vibrant Emerald** (the unified stream). |
| **Icon (16-512px)** | Triangle with two colored lines entering left vertices, merging at center, single line exiting right. Dark mode: outline + colored paths. Light: filled + paths. |
| **Favicon (16px)** | Triangle with two pixels entering, one pixel exiting. |
| **Animated** | Two beams travel → prism center (600ms) → merge with subtle pulse → single beam exits (400ms spring). Loop. |

### Color Palette: The Convergence System

```css
/* The two source streams — distinct but complementary */
--stream-audio:   #FF8C42;  /* Warm Amber — podcasts, voice, warmth, organic */
--stream-video:   #00D4C8;  /* Cool Cyan — YouTube, precision, screen light */

/* The unified output — where they meet */
--stream-unified: #10F0A8;  /* Vibrant Emerald — the combined stream, growth, harmony */

/* Chromatic aberration: symbolizes the two halves */
--ca-warm:        #FF8C42;  /* Audio half — red channel */
--ca-cool:        #00D4C8;  /* Video half — cyan channel */

/* Surface tokens derived from convergence */
--bg:             #0A0E1A;   /* Deep space */
--bg-elevated:    #111827;
--surface:        #1A2332;
--border:         #2A3648;
--text:           #E8EDF5;
--text-muted:     #7A8BA8;

/* State variants */
--unified-soft:   rgba(16, 240, 168, 0.12);
--unified-glow:   rgba(16, 240, 168, 0.4);
```

**Palette Philosophy:** 
- Two inputs (amber + cyan) → One output (emerald)
- CA uses the *input* colors (amber/cyan) to symbolize the two halves being unified
- Output color (emerald) = growth, harmony, synthesis
- No arbitrary colors — the convergence *is* the system

### Typography System

| Role | Font | Weight | Rationale |
|------|------|--------|-----------|
| **Display** | Space Grotesk | 400-700 | Geometric, precise — prism geometry |
| **UI** | Inter | 400-600 | Clean, legible, system fallback |
| **Mono** | JetBrains Mono | 400-500 | Technical precision for timestamps, URLs |

**Scale:** Modular scale 1.25 (major third) — harmonic, musical.

---

### UI Component Patterns

#### Buttons: Convergence States
```css
/* Base */
.btn { 
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1); 
  position: relative;
}

/* Unified action (primary) */
.btn-unified { 
  background: var(--stream-unified); 
  color: var(--bg);
  font-weight: 600;
}
.btn-unified::before {
  /* Subtle convergence hint: two thin lines merging */
  content: '';
  position: absolute;
  top: 50%; left: 12px; right: 12px;
  height: 1px;
  background: linear-gradient(90deg, 
    var(--stream-audio) 0%, 
    var(--stream-unified) 50%, 
    var(--stream-video) 100%);
  opacity: 0.6;
}

/* Audio-only mode */
.btn-audio { 
  background: transparent; 
  border: 1px solid var(--stream-audio);
  color: var(--stream-audio);
}
.btn-audio:hover { 
  background: var(--stream-audio); 
  color: var(--bg);
}

/* Video-only mode */
.btn-video { 
  background: transparent; 
  border: 1px solid var(--stream-video);
  color: var(--stream-video);
}
.btn-video:hover { 
  background: var(--stream-video); 
  color: var(--bg);
}
```

#### PrismConvergeToggle (Core Interaction)
```css
/* Two beams entering, one exiting */
.prism-converge-toggle {
  .beam-audio { 
    /* Warm amber, enters top-left, curves down into prism */
    stroke: var(--stream-audio);
    animation: converge-audio 400ms spring;
  }
  .beam-video { 
    /* Cool cyan, enters bottom-left, curves up into prism */
    stroke: var(--stream-video);
    animation: converge-video 400ms spring;
  }
  .prism { /* triangle, subtle refraction glow */ }
  .beam-unified { 
    /* Emerald, exits right, straight */
    stroke: var(--stream-unified);
    animation: emerge-unified 400ms spring 200ms both;
  }
}

/* States */
.state-unified   { .beam-audio, .beam-video { opacity: 1; } .beam-unified { opacity: 1; } }
.state-audio     { .beam-video { opacity: 0.2; } .beam-unified { stroke: var(--stream-audio); } }
.state-video     { .beam-audio { opacity: 0.2; } .beam-unified { stroke: var(--stream-video); } }

/* Animations */
@keyframes converge-audio { from { opacity: 0; stroke-dashoffset: 100; } to { opacity: 1; stroke-dashoffset: 0; } }
@keyframes converge-video { from { opacity: 0; stroke-dashoffset: 100; } to { opacity: 1; stroke-dashoffset: 0; } }
@keyframes emerge-unified { from { opacity: 0; stroke-dashoffset: 50; } to { opacity: 1; stroke-dashoffset: 0; } }
```

#### Queue / Player: Single Unified Flow
```css
/* Every item in queue = segment of the unified stream */
.queue-item {
  border-left: 3px solid var(--stream-unified);
  transition: border-color 200ms ease;
}

/* Playing now */
.queue-item.playing {
  border-left-color: var(--stream-unified);
  background: var(--unified-soft);
}

/* Audio-mode items (when audio-only active) */
.queue-item.audio-mode {
  border-left-color: var(--stream-audio);
}

/* Video-mode items */
.queue-item.video-mode {
  border-left-color: var(--stream-video);
}

/* Smart Episode Link: two formats, one episode */
.episode-link {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--unified-soft);
  border: 1px solid var(--stream-unified);
  font-size: 0.75rem;
}

.episode-link .icon-audio { color: var(--stream-audio); }
.episode-link .icon-video { color: var(--stream-video); }
.episode-link .icon-link  { color: var(--stream-unified); }

/* Hover: shows "Switch to audio" / "Switch to video" tooltip */
```

#### Chromatic Aberration: The Two Halves
```css
/* CA symbolizes the two source streams being unified */
.media-thumbnail,
.episode-thumbnail {
  /* Subtle: 0.5px offset using the TWO source colors */
  filter: 
    drop-shadow(0.5px 0 var(--ca-warm))   /* Audio half */
    drop-shadow(-0.5px 0 var(--ca-cool));  /* Video half */
}

/* Hover: convergence intensifies */
.media-thumbnail:hover {
  filter: 
    drop-shadow(1px 0 var(--ca-warm))
    drop-shadow(-1px 0 var(--ca-cool))
    drop-shadow(0 0 8px var(--stream-unified));
}

/* Focus: full convergence */
:focus-visible {
  filter: 
    drop-shadow(2px 0 var(--ca-warm))
    drop-shadow(-2px 0 var(--ca-cool))
    drop-shadow(0 0 12px var(--stream-unified));
}

/* Playing state: unified glow */
.playing .media-thumbnail {
  filter: drop-shadow(0 0 12px var(--stream-unified));
}

/* Accessibility */
@media (prefers-reduced-motion: reduce) {
  * { filter: none !important; }
}
```

**CA Meaning:**
- **Red/Warm offset** = Audio/Podcast half
- **Cyan/Cool offset** = Video/YouTube half  
- **Together** = They're being unified (emerald glow at center)
- **Not TikTok's red/cyan** — those are arbitrary; ours *mean* audio+video

#### Convergence Transitions
| Transition | Duration | Easing | Description |
|------------|----------|--------|-------------|
| Converge | 400ms | spring(300, 30) | Two beams → center merge |
| Emerge | 400ms | spring(300, 30) | Delayed 200ms, single beam exits |
| Format Switch | 300ms | cubic-bezier(0.4, 0, 0.2, 1) | Audio↔Video↔Unified |
| Smart Link Switch | 300ms | ease-out | Format toggle with position sync |

#### Empty States
- **No subscriptions:** Prism outline, two beams entering (amber top, cyan bottom), no exit beam yet.
- **Copy:** "Add a channel to start the convergence"
- **CTA:** "Browse Channels" (emerald button)

#### Loading States
- Two beams travel → prism center (600ms)
- Pulse at center (emerald, 800ms loop)
- Single beam exits right

---

### App Store / Marketing Assets

| Asset | Specification |
|-------|---------------|
| **App Icon (1024px)** | Dark prism. Two beams entering left (amber top, cyan bottom). Single emerald beam exiting right. Subtle convergence glow at center. |
| **Screenshots** | Frame 1: Two beams converging in prism, emerald beam emerging. Caption: "Two streams. One flow." Frame 2: Unified queue with audio/video items. Caption: "Your format. Your choice." |
| **Subtitle** | "Video & Podcast Player — Two Streams, One Flow" |
| **Tagline** | "Two streams become one." |
| **Keywords** | video, podcast, player, queue, ad-free, privacy, background play, unified |

---

### Accessibility
- `prefers-reduced-motion`: Spring → simple fade, CA disabled
- `prefers-contrast: more`: Stream colors shift to higher contrast
- CA never on text — only thumbnails, decorative
- Focus states always visible without CA
- Color-blind safe: amber/cyan/emerald distinguishable in all CVD types

---

### Design Token Count: ~100
- 3 stream colors + state variants
- 2 CA colors (warm/cool = audio/video)
- 3 spring configs (converge, emerge, switch)
- Surface tokens (4 elevations)
- Text tokens (4 weights)
- Motion tokens (durations, easings)

---

## CONCEPT 2: EchoCast — "Your audio echoes everywhere"

*(Unchanged from v1.0 — preserved for comparison)*

### Brand Essence
**Sound waves meeting broadcast.** The "echo" is your content returning to you in any format — video echoes as audio, audio echoes as video. Warmth (audio) meets precision (broadcast).

### Logo / Mark
| Variant | Description |
|---------|-------------|
| **Primary** | 3-4 concentric arcs (sound wave) emanating from left-center. A subtle vertical broadcast tower/antenna rises at center-right. Waves pass through, continue right as clean lines. One wave reflects back (the "echo"). |
| **Icon** | 3 concentric arcs + vertical line. Recognizable at 16px. |
| **Favicon** | Single arc + dot. |

### Color Palette: Warm Echo / Cool Cast
```css
/* Echo warmth (audio) */
--echo-warm:    #FF8C42;  /* Primary - warm orange */
--echo-hot:     #FF5A1A;  /* Hover/active */
--echo-glow:    #FFB380;  /* Glow/accent */
--echo-soft:    #FFE8D0;  /* Soft backgrounds */

/* Cast cool (video/stream) */
--cast-cool:    #00D4C8;  /* Teal - video/stream */
--cast-deep:    #0099A0;  /* Deeper teal */
--cast-soft:    #D0F8F5;  /* Soft backgrounds */

/* Shared neutrals */
--bg:           #0D1117;
--bg-elevated:  #161B22;
--surface:      #21262D;
--border:       #30363D;
--text:         #F0F6FC;
--text-muted:   #8B949E;

/* Ripple system */
--ripple-1:     rgba(255,140,66,0.4);
--ripple-2:     rgba(0,212,200,0.3);
```

### Typography
| Role | Font | Rationale |
|------|------|-----------|
| **Display** | Plus Jakarta Sans | Rounded, friendly — warm audio feel |
| **UI** | Inter | Clean, system fallback |
| **Mono** | Fira Code | Technical but approachable |

### UI Component Patterns

#### Buttons
```css
.btn { 
  border-radius: 12px; 
  transition: transform 150ms ease, box-shadow 150ms ease; 
}

.btn-audio {
  background: var(--echo-warm);
  color: #0D1117;
}
.btn-audio:hover {
  transform: scale(1.02);
  box-shadow: 0 0 20px var(--echo-glow);
}

.btn-video {
  background: var(--cast-cool);
  color: #0D1117;
}
.btn-video:hover {
  transform: scale(1.02);
  box-shadow: 0 0 20px rgba(0,212,200,0.5);
}
```

#### Audio/Video Toggle
```css
.echo-toggle {
  .wave { stroke: var(--echo-warm); stroke-width: 2; }
  .tower { stroke: var(--cast-cool); }
  /* Morph: wave paths flatten into tower lines, 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94) */
}
```

#### Queue / Player: Ripple Metaphor
- **Playing** = center of ripple, expanding rings
- **Queued** = calm water, distance = queue position
- **Audio mode** = continuous gentle ripple

#### Transitions
| Transition | Duration | Easing |
|------------|----------|--------|
| Wave → Tower morph | 300ms | cubic-bezier(0.25, 0.46, 0.45, 0.94) |
| Ripple expand | 600ms | ease-out (staggered 100ms) |
| Pulse (CTA) | 1000ms | infinite, ease-in-out |

#### Empty States
- Calm water surface, single drop creating expanding ripples
- **Copy:** "Drop a channel to start the echo"
- **CTA:** "Browse Channels" (warm pulse button)

#### Loading
- 3 expanding ripple rings, staggered 100ms, 600ms ease-out each

### App Store / Marketing
| Asset | Treatment |
|-------|-----------|
| **App Icon** | 3 warm arcs + cool tower on gradient (warm→cool) |
| **Subtitle** | "Video & Podcast Player — Your Echo, Everywhere" |
| **Tagline** | "Your audio echoes everywhere." |
| **Keywords** | podcast, video, player, background play, queue, ad-free |

---

## CONCEPT 3: ViewCast — "View video. Cast audio. One queue."

*(Unchanged from v1.0 — preserved for comparison)*

### Brand Essence
**Functional clarity.** View = video watching. Cast = audio/podcast broadcasting. One queue unifies both. No metaphor — just clear, honest function.

### Logo / Mark
| Variant | Description |
|---------|-------------|
| **Primary** | Camera viewfinder frame (4 corner brackets) + 3 broadcast waves emanating from center-right. Frame = View (video). Waves = Cast (audio/podcast). |
| **Icon** | Viewfinder corners (⌐) + 3 waves. Works at 16px. |
| **Favicon** | Corners + single wave. |

### Color Palette: Clean Trust
```css
/* View (video) - trustworthy blue */
--view-blue:    #3B82F6;  /* Primary */
--view-light:   #60A5FA;
--view-dark:    #1D4ED8;
--view-soft:    #DBEAFE;

/* Cast (audio/podcast) - growth green */
--cast-green:   #10B981;  /* Primary */
--cast-light:   #34D399;
--cast-dark:    #059669;
--cast-soft:    #D1FAE5;

/* Unified */
--bg:           #0F172A;
--bg-elevated:  #1E293B;
--surface:      #1E293B;
--border:       #334155;
--text:         #F1F5F9;
--text-muted:   #94A3B8;

/* Queue accent */
--accent-amber: #F59E0B;
```

### Typography
| Role | Font | Rationale |
|------|------|-----------|
| **Display** | General Sans / Outfit | Geometric, clean, modern |
| **UI** | Inter | Maximum legibility |
| **Mono** | Source Code Pro | Technical precision |

### UI Component Patterns

#### Buttons (Clarity Over Flair)
```css
.btn {
  border-radius: 8px;
  font-weight: 500;
  transition: background-color 150ms ease, opacity 150ms ease;
  /* No transforms, no shadows, no aberration */
}

.btn-video { background: var(--view-blue); color: white; }
.btn-video:hover { background: var(--view-dark); }

.btn-audio { background: transparent; border: 1px solid var(--cast-green); color: var(--cast-green); }
.btn-audio:hover { background: var(--cast-soft); }

.btn-queue { background: var(--accent-amber); color: #0F172A; }
```

#### Audio/Video Toggle
```css
.viewcast-toggle {
  .frame { /* 4 corner brackets SVG */ }
  .waves { /* 3 arcs SVG */ }
  .frame { transition: opacity 200ms ease-in-out; }
  .waves { transition: opacity 200ms ease-in-out; }
}
```

#### Queue / Player: Clean Playlist
- **Playing** = left accent bar (blue=video, green=audio), bold title
- **Queued** = normal weight, muted text
- **Drag** = simple reorder, no physics
- **Audio mode** = green accent bar persists, mini-player at bottom

#### Transitions
| Transition | Duration | Easing |
|------------|----------|--------|
| Frame ↔ Waves | 200ms | ease-in-out |
| Slide (navigation) | 250ms | ease-out |
| Corner draw (loading) | 800ms | linear |

#### Empty States
- Viewfinder frame (corners only), centered
- **Copy:** "Add channels to start viewing & casting"
- **CTA:** "Browse Channels" (blue button)

#### Loading
- Viewfinder corners drawing via SVG stroke-dashoffset (800ms linear)

### App Store / Marketing
| Asset | Treatment |
|-------|-----------|
| **App Icon** | Viewfinder + waves on gradient (blue→green) |
| **Subtitle** | "Video & Podcast Player — View. Cast. Queue." |
| **Tagline** | "View video. Cast audio. One queue." |
| **Keywords** | video player, podcast player, queue, background play, ad-free |

---

## APPLES-TO-APPLES COMPARISON

| Dimension | EchoPrism v2.0 | EchoCast | ViewCast |
|-----------|--------------|----------|----------|
| **Core Metaphor** | Prism **converges** two streams | Sound wave **echoes** + tower | Viewfinder **frames** + waves |
| **Visual Hook** | Convergence + CA | Ripple pulses | Clean viewfinder |
| **Color Language** | Amber + Cyan → Emerald | Warm echo / cool cast | Blue (view) / Green (cast) |
| **Typography** | Space Grotesk (technical) | Plus Jakarta (warm) | General Sans (clean) |
| **Button Hover** | Convergence line + CA | Pulse + glow | Color shift only |
| **Toggle Anim** | Two beams converge (400ms spring) | Wave↔Tower morph (300ms) | Frame↔Waves crossfade (200ms) |
| **Queue Metaphor** | Unified stream segments | Ripples (expanding rings) | Playlist (clean list) |
| **Loading** | Two beams → merge → emerge | Expanding ripples | Viewfinder corners drawing |
| **Empty State** | Two beams enter, no exit yet | Calm water + drop | Viewfinder frame |
| **Empty Copy** | "Add a channel to start the convergence" | "Drop a channel to start the echo" | "Add channels to start viewing & casting" |
| **CA Meaning** | Warm=Audio, Cool=Video → Unified | Glow = warmth/coolness | None (clean) |
| **Accessibility** | CA disableable | Glow respects reduced-motion | High contrast, no effects |
| **Design Tokens** | ~100 | ~60+ | ~40+ |
| **Complexity** | High (design-forward) | Medium | Low (functional) |
| **ASO Clarity** | Medium (needs subtitle) | High | Very High |

---

## CONFLICT STATUS (All Clean)

| Name | GitHub | App Store | Play Store | F-Droid | Risk |
|------|--------|-----------|------------|---------|------|
| EchoPrism | 1 empty repo | None | None | None | ✅ |
| EchoCast | 3 repos (⭐8 max, diff category) | None | None | None | ✅ |
| ViewCast | 3 tiny repos | None | None | None | ✅ |

---

## DECISION FRAMEWORK

| Priority | Choose EchoPrism v2.0 | Choose EchoCast | Choose ViewCast |
|----------|----------------------|-----------------|-----------------|
| **Design-led product** (Linear, Arc, TikTok) | ✅ | | |
| **Warmth + approachability** | | ✅ | |
| **ASO / instant clarity** | | | ✅ |
| **Implementation speed** | Slow (~100 tokens) | Medium (~60+) | Fast (~40) |
| **Long-term ownability** | Highest | High | Medium |
| **Design system depth** | Highest | Medium | Low |

---

## COMPREHENSION TEST (Run Before Deciding)

> **Protocol:** Show name + subtitle for 3 seconds to 5 people. Ask:
> 1. "What does this app do?"
> 2. "Would you download it? Why?"
> 3. "Three words that come to mind."

| Name | Subtitle |
|------|----------|
| EchoPrism | "Video & Podcast Player — Two Streams, One Flow" |
| EchoCast | "Video & Podcast Player — Your Echo, Everywhere" |
| ViewCast | "Video & Podcast Player — View. Cast. Queue." |

---

## NEXT STEPS AFTER SELECTION

1. **Trademark screening** (USPTO, EUIPO, WIPO) for chosen name
2. **Domain acquisition** (.app, .io, .dev, .co — .com taken)
3. **Update `replica/brand.md`** with chosen name, final palette, logo brief
4. **Run `/replica-brand`** to generate brand.json, sweep config
5. **Run `/replica-recon`** for unified screen/flow mapping
6. **Run `/replica-architect`** for Tauri + yt-dlp + Invidious pool architecture

---

## CONTACT / VERSION

**Document:** `replica/brand_design_concepts.md`  
**Created:** 2026-10-11  
**Updated:** 2026-10-11 v2.0 — EchoPrism redesigned for **convergence** (two streams → one unified flow)  
**Version:** 2.0  
**Author:** Brand design brainstorming session  
**Related:** `replica/brand.md`, `replica/brand.json`, `replica/fixes_combined.md`, `replica/features.csv`

---

*All three concepts are production-ready. EchoPrism v2.0 now embodies **convergence**: two distinct streams (audio/podcast + video/YouTube) enter the prism and emerge as one unified emerald stream. The CA system symbolizes the two source halves (amber=audio, cyan=video) merging into emerald harmony. Choose based on product vision: design-forward convergence (EchoPrism), warm-approachable (EchoCast), or clarity-first (ViewCast).*
