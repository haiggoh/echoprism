# EchoPrism Brand Identity

**Angle:** "Two streams become one" — Video & Podcast Player that unifies YouTube watching and podcast listening into a single unified stream.

**Positioning:** Free, open-source alternative client built on Tauri with built-in ad/tracker blocking, chronological feed, unified queue with Smart Episode Linking, audio mode, RSS aggregation.

---

## Step 1: Name Selected

**EchoPrism** — The prism **converges** two streams (audio/podcast + video/YouTube) into one unified stream.

**Why:** 
- Optical metaphor (prism) + acoustic metaphor (echo) = perfect fusion
- "Convergence" philosophy: two distinct streams (audio/podcast + video/YouTube) enter, one unified stream exits
- Visual design system built on convergence physics (amber + cyan → emerald)
- No conflicts: 1 empty GitHub repo, no app store presence, domains available
- Visual design language: convergence physics, chromatic aberration as two-halves symbol, emerald unification

---

## Step 2: Screening Checks (Status Recorded)

| Check | Status | Notes |
|-------|--------|-------|
| US TM (Class 9, 42) | ☐ **PENDING** | Run: tmsearch.uspto.gov — Class 9 (software), Class 42 (SaaS) |
| EU TM (EUIPO) | ☐ **PENDING** | Run: euipo.europa.eu — Class 9, 42 |
| Canada TM (CIPO) | ☐ **PENDING** | Run: ised-isde.canada.ca |
| WIPO Global | ☐ **PENDING** | Run: wipo.int/branddb |
| Domain .com | **TAKEN** | echoprism.com (Namecheap) |
| Domain .app | **AVAILABLE** | echoprism.app — IANA referral, likely available |
| Domain .io | **TAKEN** | echoprism.io (Namecheap) |
| Domain .dev | **AVAILABLE** | echoprism.dev — IANA referral |
| Domain .co | **AVAILABLE** | echoprism.co — IANA referral |
| Domain .xyz | **AVAILABLE** | echoprism.xyz — IANA referral |
| App Store | ☐ **PENDING** | No listing found — manual check needed |
| Play Store | ☐ **PENDING** | No listing found — manual check needed |
| X/Twitter handle | ☐ **PENDING** | Check @echoprism |
| GitHub Org | **RESERVED** | github.com/Echoprism (no repos, likely reserved by us) |
| Web Search | ☐ **PENDING** | Search "EchoPrism video player" |

> ⚠️ **SCREENING CHECKS ONLY** — Before committing, a trademark lawyer must do proper clearance.
> **Priority:** File USPTO intent-to-use ASAP for Class 9 (downloadable software) and Class 42 (SaaS/platform).

---

## Step 3: Palette — The Convergence System

**YouTube's brand:** Red `#FF0000` (primary), near-black `#0F0F0F`, white `#FFFFFF`

**EchoPrism Convergence Palette:** Two streams converge into one.

| Role | Token | Hex | Meaning |
|------|-------|-----|---------|
| **Stream Audio** | `color-stream-audio` | `#FF8C42` | Warm Amber — podcasts, voice, organic, warmth |
| **Stream Video** | `color-stream-video` | `#00D4C8` | Cool Cyan — YouTube, precision, screen light |
| **Stream Unified** | `color-stream-unified` | `#10F0A8` | Vibrant Emerald — synthesis, harmony, growth |
| **CA Warm** | `color-ca-warm` | `#FF8C42` | Audio half (red channel offset) |
| **CA Cool** | `color-ca-cool` | `#00D4C8` | Video half (cyan channel offset) |
| **Unified Glow** | `color-unified-glow` | `rgba(16,240,168,0.4)` | Convergence center glow |
| **Unified Soft** | `color-unified-soft` | `rgba(16,240,168,0.12)` | Subtle backgrounds |

**Surface tokens (derived from convergence):**

| Role | Token | Hex |
|------|-------|-----|
| Background | `color-bg` | `#0A0E1A` |
| Background Elevated | `color-bg-elevated` | `#111827` |
| Surface | `color-surface` | `#1A2332` |
| Border | `color-border` | `#2A3648` |
| Text Primary | `color-text` | `#E8EDF5` |
| Text Muted | `color-text-muted` | `#7A8BA8` |

**Add to brand.json for sweep:** YouTube's `#FF0000`, `#282828`, `#FFFFFF`

**Contrast check:** Run `python3 ../replica-design/contrast.py replica/design/tokens.json` after tokens.json is created.

---

## Step 4: Logo Brief — Convergence Prism

**Name:** EchoPrism

**One-line idea:** Two beams enter the prism (amber audio, cyan video), converge at center with a pulse, one emerald beam exits — two streams become one.

**Mark type:** Symbol + wordmark (symbol works alone at 16px favicon)

**Requirements:**
- Works at 16px (favicon) and 1024px (app icon)
- No transparency for iOS app icon (1024x1024 solid background)
- Deliverables: SVG, 1024x1024 PNG (iOS), favicon set (16, 32, 48, 64, 128, 256), social 1200x630
- **Must not resemble YouTube's play button:** No red triangle, no rounded-rect play icon, no red/white combo as primary
- Palette: Amber `#FF8C42` + Cyan `#00D4C8` → Emerald `#10F0A8` on dark `#0A0E1A`
- Style: Clean, geometric, modern — suggests **convergence**, not splitting

**Concept sketches to explore:**
1. Triangle prism: amber beam (top-left) + cyan beam (bottom-left) → converge at center with pulse → single emerald beam exits right
2. Minimal "E" formed by two converging lines forming prism geometry
3. Two lines converging → pulse → single line (feed → convergence → player)

**Animation reference:** Two beams travel left→center (600ms), pulse at center (emerald, 800ms), single beam exits right (400ms spring). Loop.

---

## Step 5: Voice

**Three words:** **Direct, Calm, Empowering**

| Word | Does mean | Does NOT mean |
|------|-----------|---------------|
| Direct | Clear, no fluff, says what it does | Blunt, rude, terse |
| Calm | Steady, not pushy, respects attention | Passive, boring, low-energy |
| Empowering | Gives control, user decides | Permissive, anything goes |

**Do / Don't pairs:**

| Do | Don't |
|----|-------|
| "Play next" / "Add to queue" | "Up next" (algorithmic), "Recommended for you" |
| "Your feed, chronological" | "Personalized for you" |
| "Ad-free by default" | "Upgrade to remove ads" |
| "Background play just works" | "Premium feature unlocked" |
| "No account needed" | "Sign in to continue" |
| "Your data stays local" | "We personalize your experience" |
| "Skip sponsors automatically" | "Includes sponsored content" |
| "Open source, free forever" | "Free trial, then subscribe" |
| "You choose the instance" | "Powered by Google" |
| "Built for power users" | "Simple for everyone" |

**Top 10 strings rewritten in voice:**

| Context | YouTube-style | EchoPrism voice |
|---------|---------------|-----------------|
| App title | YouTube | EchoPrism |
| Main nav: home | Home | Feed |
| Main nav: shorts | Shorts | (hidden/disabled) |
| Main nav: subscriptions | Subscriptions | Channels |
| Main nav: library | Library | Queue |
| Empty feed | "No videos yet" | "No channels added. Import or search to start." |
| Primary button | "Sign in" | "Add channels" (or "Import subscriptions") |
| Queue empty | "Add videos to play" | "Pick from feed → Play next / Add to end" |
| Audio mode toggle | "Audio only" | "Audio mode — keeps playing in background" |
| Settings: ads | "Ad settings" | "Blocking: Ads ✓ Sponsors ✓ Trackers ✓" |
| Error state | "Something went wrong" | "Failed to load. Check connection or try another instance." |

---

## Step 6: Brand Files

### replica/brand.json
```json
{
  "name": "EchoPrism",
  "avoid": ["YouTube", "Google", "YT", "yt", "youtube"],
  "domains": ["youtube.com", "youtu.be", "googlevideo.com", "ggpht.com", "googleapis.com", "ytimg.com"],
  "colors": ["#FF0000", "#282828", "#FFFFFF", "#FF1A1A", "#CC0000", "#FF3333"],
  "checks": {
    "us_tm": "pending",
    "eu_tm": "pending",
    "canada_tm": "pending",
    "wipo": "pending",
    "domain_com": "taken",
    "domain_app": "available",
    "domain_dev": "available",
    "domain_co": "available",
    "domain_xyz": "available",
    "domain_io": "taken",
    "app_store": "pending",
    "play_store": "pending",
    "x_handle": "pending",
    "github": "reserved"
  }
}
```

### replica/brand.md
This file (the one you're reading).

### Updated tokens.json
Will be created by `/replica-design` with the Convergence Palette above.

---

## Design System Reference (from brand_design_concepts.md v2.0)

### Core Interaction: PrismConvergeToggle
Two beams enter left (amber top, cyan bottom) → converge at prism center with pulse → single emerald beam exits right.

**States:** Unified / Audio-only / Video-only — each animates beam paths accordingly.

### Color System: The Convergence Palette
```css
/* Two distinct inputs */
--stream-audio: #FF8C42;   /* Warm Amber — podcasts, voice, organic */
--stream-video: #00D4C8;   /* Cool Cyan — YouTube, precision, screen */

/* One unified output */
--stream-unified: #10F0A8; /* Vibrant Emerald — synthesis, harmony */

/* CA = the two halves being unified */
--ca-warm: #FF8C42;        /* Audio half (red channel) */
--ca-cool: #00D4C8;        /* Video half (cyan channel) */
```

### Chromatic Aberration: The Two Halves
```css
/* CA symbolizes the two source streams being unified */
.media-thumbnail {
  filter: drop-shadow(0.5px 0 var(--ca-warm))   /* Audio half */
          drop-shadow(-0.5px 0 var(--ca-cool));  /* Video half */
}
/* Not TikTok's arbitrary red/cyan — ours MEAN audio+video */
```

### Core Motion
| Transition | Duration | Easing |
|------------|----------|--------|
| Converge | 400ms | spring(300, 30) |
| Emerge | 400ms | spring(300, 30) delayed 200ms |
| Format Switch | 300ms | cubic-bezier(0.4, 0, 0.2, 1) |

---

## Next Steps

1. **Run trademark screening** (USPTO, EUIPO, CIPO, WIPO) for EchoPrism
2. **Secure domains** (.app, .dev, .co, .xyz — .app/.dev/.co/.xyz available)
3. **Update `replica/brand.json`** with final status
3. **Run `/replica-brand`** to generate brand.json, sweep config
4. **Run `/replica-recon`** for unified screen/flow mapping
5. **Run `/replica-architect`** for Tauri + yt-dlp + Invidious pool + episode matcher architecture

**Recommended stack:** Tauri (Rust + WebView) for desktop, Capacitor for mobile — lighter than Electron, uses system WebView, smaller binary. Backend: yt-dlp for extraction, Invidious/Piped instance pool with auto-failover, client-side SABR via yt-dlp/Shaka, SponsorBlock API, podcast RSS parser, episode matcher (local SQLite, WiFi background task).
