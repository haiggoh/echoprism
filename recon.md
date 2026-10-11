# EchoPrism Recon Map

**App:** YouTube (Web, iOS, Android) + Podcast Apps (Overcast, AntennaPod, Pocket Casts)  
**Scope:** Unified client for YouTube watching + Podcast listening with Smart Episode Linking  
**Platform:** Desktop (Windows/Mac/Linux) + Mobile (iOS/Android) via Tauri + Capacitor  
**Target:** Power users who want unified video+podcast queue, ad-free, chronological, privacy-first

---

## Step 1: Scope

1. **App/Platform:** YouTube (Web/iOS/Android) + Major Podcast Apps (Overcast, AntennaPod, Pocket Casts)
2. **Slice:** Core loop — Discover → Subscribe → Queue → Play (unified video+audio)
3. **For:** Product to sell — "EchoPrism" unified client

---

## Step 2: Sources

| Source | URL | Value |
|--------|-----|-------|
| YouTube Help | https://support.google.com/youtube | Feature list, settings, keyboard shortcuts |
| YouTube Keyboard Shortcuts | https://support.google.com/youtube/answer/7631406 | Player controls, navigation |
| YouTube Premium Features | https://www.youtube.com/premium | Gated features (background, downloads, PiP) |
| YouTube Changelog | https://blog.youtube/news-and-events/ | Recent additions (Shorts, Live, Clips) |
| YouTube Web App | https://www.youtube.com | Live screens, flows, keyboard shortcuts |
| YouTube Mobile App | App Store / Play Store | Mobile-specific flows (gestures, PiP) |
| Overcast Help | https://overcast.fm/help | Podcast features, Smart Speed, Voice Boost |
| AntennaPod Docs | https://antennaPod.org/docs | Open-source podcast features |
| Pocket Casts Features | https://www.pocketcasts.com/features/ | Sync, discovery, queue management |
| Invidious Docs | https://docs.invidious.io | Privacy frontend API, instance list |
| yt-dlp Docs | https://github.com/yt-dlp/yt-dlp | Extraction capabilities, formats |
| SponsorBlock API | https://sponsor.ajay.app/api | Skip segments, categories |
| Podcast Index | https://podcastindex.org/ | Podcast search, RSS, episodes |

---

## Step 3: Screen Inventory

| ID | Screen | Route/Access | Purpose | Key Components | States |
|----|--------|--------------|---------|----------------|--------|
| S01 | Onboarding / Welcome | `/` (first run) | Import subscriptions, pick instances, choose preferences | Import wizard, instance picker, format preference toggle | Empty, loading, success, error |
| S02 | Unified Feed | `/feed` | Chronological subscription feed (video + podcast) | Channel list, episode cards, filter tabs, search | Empty, loading, filled, error, offline |
| S03 | Episode Detail (Video) | `/video/:id` | Watch video, see description, comments, related | Player, metadata, queue actions, Smart Link badge | Playing, paused, buffering, error, PiP |
| S04 | Episode Detail (Audio) | `/episode/:id` | Listen to podcast, see show notes, chapters | Player, waveform, chapters, queue actions, Smart Link badge | Playing, paused, buffering, background, error |
| S05 | Unified Queue | `/queue` | Manage play order, reorder, audio/video toggle | Drag handle, format badge, play next/add end, Smart Link | Empty, playing, paused, reordering |
| S06 | Channel / Show Page | `/channel/:id` | Browse uploads/episodes, subscribe, manage notifications | Tabs (Videos/Shorts/Playlists/Podcasts), subscribe btn | Empty, loading, subscribed, error |
| S07 | Search | `/search?q=` | Unified search across YouTube + podcasts | Tabs (All/Video/Podcast/Channel), filters, Smart Link preview | Empty, loading, results, no results |
| S08 | Settings | `/settings` | Instance management, format preferences, queue behavior | Instance pool, format defaults, queue behavior, SponsorBlock | Saved, saving, error |
| S09 | Instance Manager | `/settings/instances` | Add/remove/test Invidious/Piped instances | Instance list, health check, auto-failover toggle | Healthy, degraded, failed, testing |
| S10 | Podcast RSS Manager | `/settings/podcasts` | Add/import/export OPML, manage podcast feeds | OPML import/export, feed list, auto-discovery | Empty, loaded, syncing, error |
| S11 | Smart Episode Linking | `/settings/linking` | Manage audio↔video episode matches | Match list, confidence, manual link/unlink | Empty, matching, matched, conflict |
| S12 | History / Continue Watching | `/history` | Recently played, progress sync | List, progress bars, resume button, clear | Empty, loaded, synced |
| S13 | Downloads / Offline | `/downloads` | Manage offline content, storage | List, progress, quality selector, delete | Empty, downloading, completed, failed |
| S14 | Player (Fullscreen) | `/player/:id?fullscreen=1` | Immersive video/audio playback | Controls, quality, speed, chapters, SponsorBlock, PiP | Playing, paused, buffering, error |
| S15 | Mini Player / Background | Persistent bottom bar | Background audio, quick controls | Play/pause, skip, title, artwork, expand | Playing, paused, hidden |
| S16 | Keyboard Shortcuts Help | `?` or `/settings/shortcuts` | Reference for power users | Categorized list, searchable | Open, closed |
| S17 | Instance Health Dashboard | `/settings/instances/health` | Real-time instance status, latency, failover | Grid, latency bars, last checked, manual failover | Healthy, degraded, failed |
| S18 | Smart Link Manager | `/settings/linking` | View/edit audio↔video episode matches | Match list, confidence %, manual link/unlink, bulk | Empty, matching, matched, conflict |

---

## Step 4: User Flows

| ID | Flow | Screens | Happy Path Clicks | Edge Cases |
|----|------|---------|-------------------|------------|
| F01 | **First Run Setup** | S01 → S02 | 4 (import → instance → format → done) | Import fails, no instances healthy, user skips import |
| F02 | **Discover & Subscribe** | S02 → S07 → S06 → S02 | 3 (search → channel → subscribe → back) | No results, private channel, instance fail |
| F03 | **Play Video** | S02 → S03 → S14 | 2 (feed → video → fullscreen) | Age-restricted, geo-blocked, instance fail, SABR fail |
| F04 | **Play Podcast** | S02 → S04 → S15 | 2 (feed → episode → mini-player) | No audio stream, episode missing, background kill |
| F05 | **Queue Management** | S02 → S05 (drag) | 2 (feed → drag to queue) | Reorder, play next/add end, remove, clear |
| F06 | **Audio↔Video Switch** | S03 ↔ S04 (Smart Link) | 1 (tap Smart Link badge) | No match, low confidence, position sync fail |
| F07 | **Background Audio** | S14 → S15 (home) → S15 (lock) | 0 (automatic) | OS kills background, Bluetooth disconnect, call interrupt |
| F08 | **Offline Download** | S03/S04 → S13 | 2 (menu → download quality) | Storage full, network change, quality unavailable |
| F09 | **Instance Failover** | S03/S04 → S09 (auto) | 0 (automatic) | All instances down, manual selection needed |
| F10 | **Smart Episode Link** | S03/S04 → S11 (auto WiFi) | 0 (background) | No match, low confidence, manual correction |
| F11 | **Keyboard Navigation** | S02 (shortcuts) | 0 (keyboard only) | Focus trap, modal escape, shortcut conflict |
| F12 | **OPML Import/Export** | S10 → S02 | 3 (import → select → done) | Malformed OPML, duplicate feeds, sync conflict |

---

## Step 5: Components

| Name | Variants | States | Used In |
|------|----------|--------|---------|
| **PrismConvergeToggle** | Unified / Audio / Video | Default, hover, active, disabled, loading | S03, S04, S05, S14, S15 |
| **EpisodeCard** | Video / Audio / Smart Link | Default, hover, playing, queued, downloaded | S02, S06, S07, S12 |
| **ChannelCard** | Subscribed / Not | Default, hover, subscribed, loading | S02, S06, S07 |
| **QueueItem** | Video / Audio / Smart Link | Default, playing, queued, dragging, audio-mode | S05, S15 |
| **InstanceCard** | Healthy / Degraded / Failed | Default, testing, selected, expanded | S09, S17 |
| **EpisodeLinkBadge** | Matched / Low Confidence / Manual | Default, hover, click-to-switch | S03, S04, S11, S18 |
| **InstanceHealthGrid** | Healthy / Degraded / Failed | Default, testing, manual-failover | S17 |
| **QueueDragHandle** | Default / Dragging | Default, dragging, drop-target | S05 |
| **MiniPlayer** | Collapsed / Expanded | Playing, paused, hidden, audio-only | S15 (persistent) |
| **DownloadButton** | Video / Audio | Default, downloading, downloaded, failed | S03, S04, S13 |
| **SponsorBlockMarker** | Categories | Visible, skipped, hidden | S14 |
| **ChapterMarker** | Video / Audio | Default, current, hovered | S03, S04, S14 |
| **Waveform** | Static / Live | Static, playing, seeking | S04, S14, S15 |
| **ConvergenceLoader** | Beams converging | Beams traveling, merging, emerging | S01, S14, loading states |
| **ConvergenceCA** | Subtle / Hover / Focus | 0.5px / 1px / 2px offsets | Thumbnails, media, focus |
| **ConvergenceBeam** | Audio / Video / Unified | Traveling, merging, emerging | S01, S14, loading |
| **QueueDragHandle** | Default / Dragging | Default, dragging, drop-target | S05 |
| **SmartLinkBadge** | High Conf / Low Conf / Manual | Default, hover, click | S03, S04, S11, S18 |
| **InstanceHealthIndicator** | Green / Yellow / Red | Pulse, static, testing | S09, S17, S03, S04 |
| **QueueEmptyState** | Default / Audio Mode | Default, audio-mode | S05 |
| **FeedFilterTabs** | All / Video / Podcast / Queue | Active, inactive, disabled | S02, S07 |
| **InstanceHealthBar** | Latency / Health | Green / Yellow / Red | S09, S17 |
| **KeyboardShortcutRow** | Category / Shortcut | Default, hover | S16 |

---

## Step 6: Inferred Data Model

| Entity | Fields | Evidence | Confidence |
|--------|--------|----------|------------|
| **Channel** | id, title, handle, thumbnail_url, description, subscriber_count, is_subscribed, subscription_date, instance_id, type (video/podcast/both) | S02, S06, S07, S09 | High |
| **Episode/Video** | id, channel_id, title, description, thumbnail_url, duration, published_at, url, video_id, podcast_guid, episode_number, season_number, audio_url, video_url, formats[], chapters[], sponsors[], transcript_url, is_downloaded, download_quality, progress_seconds | S02, S03, S04, S06, S13, S14 | High |
| **Subscription** | user_id, channel_id, subscribed_at, notifications_enabled, format_preference (video/audio/both), instance_id | S01, S02, S06, S09 | High |
| **QueueItem** | id, episode_id, position, added_at, source (feed/search/manual), play_mode (video/audio/unified), smart_link_id | S05, S15 | High |
| **SmartEpisodeLink** | id, podcast_guid, youtube_video_id, confidence, matched_at, matched_by (auto/manual), title_similarity, date_diff, duration_diff, user_confirmed | S11, S18 | High |
| **Instance** | id, url, type (invidious/piped), health (healthy/degraded/failed), latency_ms, last_checked, auto_failover, supports_sabr, supports_age_restricted, region | S09, S17 | High |
| **Queue** | id, user_id, current_index, items[], repeat_mode, shuffle, audio_only_mode, created_at, updated_at | S05, S15 | High |
| **PlaybackState** | episode_id, position_seconds, duration_seconds, playback_rate, volume, is_audio_mode, is_pip, current_instance_id, last_updated | S14, S15 | High |
| **Download** | id, episode_id, quality, format, file_path, file_size, status (pending/downloading/completed/failed), progress, created_at, completed_at | S13 | High |
| **SubscriptionImport** | id, source (youtube/opml/instance), status, channels_found, channels_imported, errors[], created_at | S01, S10 | Medium |
| **InstanceHealthLog** | instance_id, checked_at, latency_ms, status, error_message, video_id_tested | S17 | Medium |
| **UserPreferences** | user_id, default_instance_id, default_format (video/audio/unified), queue_behavior (play_next/add_end), audio_only_default, auto_download_wifi, sponsorblock_enabled, sponsorblock_categories, keyboard_shortcuts_enabled, theme (dark/light/system) | S08 | High |
| **KeyboardShortcut** | action, key_combination, context (global/player/queue), enabled | S16 | Medium |
| **SponsorBlockSegment** | video_id, start_time, end_time, category, votes, uuid | S14 | Medium |
| **Chapter** | episode_id, start_time, end_time, title, image_url | S03, S04, S14 | Medium |

---

## Step 7: Feature Matrix (replica/features.csv)

See `replica/features.csv` for the complete matrix with columns: feature, area, priority, original, clone, notes.

---

## Step 8: What Cannot Be Cloned (Skip Rows)

| Feature | Reason |
|---------|--------|
| YouTube's video library / content | Licensed content owned by creators/YouTube |
| YouTube's user base / social graph | Network effect, not a feature |
| YouTube's recommendation algorithm | Proprietary, requires their data |
| YouTube Music integration | Separate licensed product |
| YouTube Live Chat (proprietary) | Requires YouTube backend |
| YouTube Premium subscription revenue | Business model, not feature |
| YouTube Kids / YouTube TV | Separate products |
| Google account integration / OAuth | Proprietary auth system |
| YouTube Analytics / Creator Studio | Creator tools, not viewer features |
| YouTube's CDN / infrastructure | Infrastructure, not feature |
| Partner deals (NFL, NBA, etc.) | Licensed content deals |
| YouTube's ad platform | Business model |

---

## Step 9: Size Estimate

| Category | Count | Complexity |
|----------|-------|------------|
| Screens | 18 | Medium |
| Flows | 12 | Medium |
| Entities | 18 | High (SmartLink, InstancePool, Convergence) |
| Components | 25 | Medium-High |
| Hard Parts | 4 | **Instance pool auto-failover, Client-side SABR, Smart Episode Linking, Background audio lifecycle** |

**Overall Size: L (a quarter)** — Tauri + instance pool + Smart Episode Linker + podcast parser + SponsorBlock + background sync = quarter for v1.0 MVP.

---

## Five-Line Summary

1. **Core Loop:** Discover → Subscribe → Queue → Play (unified video+audio) → Smart Link switch
2. **Screens/Flows:** 18 screens, 12 flows, 18 entities, 25 components
3. **Hardest Parts:** (1) Instance pool auto-failover with health checks, (2) Client-side SABR via yt-dlp/Shaka, (3) Smart Episode Linking (local ML matching + WiFi background), (4) Background audio lifecycle across OS
4. **Out of Scope:** YouTube content, social features, creator tools, live chat, YouTube Music, paid subscriptions
5. **Next Step:** `/replica-architect` — Tauri + yt-dlp + Invidious pool + episode matcher + podcast parser + SponsorBlock
