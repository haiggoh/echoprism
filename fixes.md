# YouTube Client: Fix Plan & Positioning

Based on 93 reviews from 11 sources (Trustpilot, Reddit, Hacker News, G2, Capterra, 9to5Google, Cybernews, Tom's Guide, Lifehacker, iDownloadBlog, Music Business Worldwide)

---

## Scope Clarification

**NOT a new video platform** — too huge. Instead: **A free, open-source alternative YouTube client** (desktop + mobile) that:
- Accesses existing YouTube videos (no upload/hosting)
- Also aggregates RSS podcast feeds
- Built on a browser core (Chromium/Firefox WebView) for adblocker plugin compatibility
- Built-in ad/tracker blocking (like Brave)
- Adds power-user features YouTube native lacks

---

## 1. What They Hate (Complaints about YouTube's native apps)

| # | Problem | Reviews | Sources | Key Quotes |
|---|---------|---------|---------|------------|
| 1 | **Excessive, unskippable ads** | 18 | 5 | "YouTube ads are the worst" (Trustpilot, 1★); "3 minutes ads every 30 seconds" (Trustpilot, 1★); "corner ads during fullscreen... can't be dismissed" (9to5Google, 1★) |
| 2 | **Repeated Premium price hikes without notice** | 24 | 5 | "Premium price increased by nearly 30%" (HN, 2022); "Mine went from €17.99 to €25.99... this is cable TV all over again" (Cybernews, 1★); "I canceled the second I saw the email" (Cybernews, 1★) |
| 3 | **App crashes & instability** | 15 | 3 | "YouTube app keeps getting worse... Random crashes, videos not loading" (Reddit, 1★); "It crashes constantly. UI is clunky" (Reddit, 1★); "Google acknowledged: app is crashing" (iDownloadBlog, 1★) |
| 4 | **Broken Premium features (PiP, background play, downloads)** | 8 | 3 | "Picture-in-picture still doesn't work properly on iOS after years" (Reddit, 1★); "Background play stops working randomly" (Reddit, 1★); "Premium downloads fail half the time" (Reddit, 1★) |
| 5 | **Broken search & opaque algorithm** | 10 | 3 | "Recommendations are terrible - 80% Shorts, 15% already watched" (Reddit, 2★); "Zero transparency on why videos are recommended" (Reddit, 2★); "Youtube Search Suddenly Broken" (Reddit, 1★) |
| 6 | **Hostile UI redesigns nobody asked for** | 6 | 3 | "They want a bigger focus on suggested videos so you watch more ads" (Reddit, 1★); "video player squished into top-left corner" (Lifehacker, 2★) |
| 7 | **Premium users still seeing ads/sponsors** | 5 | 2 | "I pay for premium and I am getting popup ads" (Reddit, 2★); "Why do I see ads on videos from creators I'm already paying?" (Reddit, 2★) |
| 8 | **Forced Shorts with no disable option** | 7 | 3 | "No way to disable Shorts completely, they keep forcing it in the feed" (Reddit, 1★); "Shorts cannot be disabled" (Reddit, 1★) |

---

## 2. What Is Missing (Features users ask for by name)

| # | Missing Feature | Reviews | Sources | Key Quotes |
|---|-----------------|---------|---------|------------|
| 1 | **Disable Shorts completely** | 7 | 3 | "No way to disable Shorts completely" (Reddit, 1★); "Shorts will be disabled for 30 days... catch" (Reddit, 2★) |
| 2 | **Algorithm transparency & user control** | 4 | 2 | "Zero transparency on why videos are recommended" (Reddit, 2★) |
| 3 | **Chronological subscription feed with queue management** | 0 (new) | — | **NEW:** Users want a scrollable chronological list of new videos from subscriptions with one-click "play next / add to queue" |
| 4 | **Audio-only background playback like a podcast player** | 8 | 3 | "Background play stops working randomly" (Reddit, 1★); PiP/background play broken for paying users |
| 5 | **RSS podcast feed aggregation** | 1 | 1 | "No native podcast hosting integration, have to use workarounds" (G2, 3★) |
| 6 | **Built-in ad/tracker blocking that actually works** | 18 | 5 | All ad complaints imply this need; "forcing people to disable AdBlock" (Trustpilot, 1★) |
| 7 | **Cross-platform (desktop + mobile) with sync** | 5 | 2 | "iOS app is better than Android and I've found the opposite to be true" (Reddit, 2★) |

---

## 3. What Is Unsolved (Whole jobs YouTube ignores)

| # | Unsolved Job | Evidence | Opportunity |
|---|--------------|----------|-------------|
| 1 | **Ad-free YouTube viewing without paying $16+/mo** | 42 ads+pricing reviews across 5 sources | Built-in blocking + no account needed for basic viewing |
| 2 | **Unified video + podcast player with queue management** | 8 broken background play + 1 podcast request + 0 chronological queue | No app does this well; YouTube Music is separate and lacks video queue |
| 3 | **Chronological subscription feed with "play next" queue UX** | 0 (latent) | YouTube's feed is algorithmic; users want chronological + queue control |
| 4 | **Stable, lightweight client that doesn't crash** | 15 crash reviews, 3 sources | Browser-core based = stable; native apps are bloated |

---

## 4. Fix Plan (Top 10 by evidence × fixability)

| # | Fix | Size | Component | Evidence |
|---|-----|------|-----------|----------|
| 1 | **Built-in ad/tracker blocking (Brave-style)** | M | Core (browser engine) | 18 reviews, 5 sources |
| 2 | **Chronological subscription feed (newest first)** | M | UI/Feed | Latent need; solves algorithm opacity |
| 3 | **Video queue: "Play next" / "Add to end" from feed** | M | UI/Player | New power-user feature; no native equivalent |
| 4 | **Audio-only mode with background playback** | S | Player | 8 reviews on broken background play |
| 5 | **RSS podcast feed support + unified queue** | M | Feed/Player | 1 review + latent need |
| 6 | **Shorts: fully disableable / hideable** | S | UI/Feed | 7 reviews, 3 sources |
| 7 | **Cross-platform: desktop (Win/Mac/Linux) + mobile (iOS/Android)** | L | Build | 5 reviews on platform inconsistency |
| 8 | **No account required for viewing; optional sync via YouTube API** | S | Auth | Removes login friction |
| 9 | **SponsorBlock integration (skip sponsor segments)** | S | Player | 5 reviews on Premium users seeing sponsors |
| 10 | **Lightweight, fast, crash-free (browser core)** | M | Core | 15 crash reviews |

---

## 5. Positioning Angle (Single, Focused)

### "The YouTube Client That Respects Your Time & Attention"
> **For power users who want YouTube without the hostile UI, ads, and broken features,**
> **OpenTube** is a free, open-source client built on a browser core that blocks ads natively, gives you a chronological subscription feed with a real video queue, plays audio in the background like a podcast app, and aggregates RSS feeds — all without requiring an account.
> **Evidence:** 42 reviews on ads/pricing; 15 on crashes; 8 on broken background play; 7 on forced Shorts; 10 on opaque algorithm.

**Why this works:**
- **Scope is achievable**: Client only, no hosting/upload/moderation
- **Leverages existing infra**: Browser engine (Chromium/WebView), YouTube's own API/Invidious instances, yt-dlp for extraction
- **Differentiators are UX, not infrastructure**: Queue management, chronological feed, audio mode, RSS aggregation
- **Open source + free** directly answers the pricing/ads complaints
- **Browser core** means uBlock Origin / Brave shields compatible + future-proof

---

## Next Step: `/replica-brand`

Name it, palette, logo brief, voice — all driven by "respects your time & attention."
Then: `/replica-recon` → `/replica-architect` (Electron/Tauri + yt-dlp + Invidious) → `/replica-design` → `/replica-build` → `/replica-test` → `/replica-diff` → `/replica-launch` → `/replica-deploy`
