# EchoPrism Architecture

**Stack:** Tauri (Rust + WebView) + TypeScript/React + SQLite (local) + yt-dlp + Invidious/Piped pool + SponsorBlock + Podcast parser + Episode matcher

---

## Step 1: The Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Desktop App** | Tauri (Rust + WebView) | Native performance, small binary, system WebView (no Electron bloat), Rust for backend logic (instance pool, yt-dlp, episode matcher) |
| **Mobile** | Capacitor (iOS/Android) | Single codebase, WebView-based, access native APIs (background audio, downloads, notifications) |
| **Frontend** | React + TypeScript + Tailwind | Type safety, component reuse, design tokens from replica-design |
| **State** | Zustand + TanStack Query | Lightweight global state, server state for instance health/queue sync |
| **Local DB** | SQLite (sql.js / rust sqlite) | Fully local, zero config, episode links, subscriptions, queue, history, instance pool |
| **Backend (Rust)** | Tauri commands + background tasks | Instance pool management, yt-dlp extraction, episode matcher, SponsorBlock, podcast parser |
| **Video Extraction** | yt-dlp (bundled) + Invidious/Piped pool | No API keys, client-side SABR via yt-dlp/Shaka, auto-failover |
| **Podcast Parsing** | Rust RSS/Atom/JSON Feed parser | OPML import/export, episode extraction, auto-discovery |
| **Episode Matcher** | Rust (local SQLite + FTS) | WiFi background task, fuzzy title/date/duration matching, local only |
| **SponsorBlock** | SponsorBlock API (local cache) | Community skip segments, offline-first cache |
| **Invidious/Piped Pool** | Rust async (reqwest + tokio) | Health checks, auto-failover, latency-based routing, SABR support detection |
| **Background Audio** | Tauri plugin (media-session) + native | iOS/Android background audio, media session, lock screen controls |
| **Downloads** | Tauri fs + yt-dlp | Offline video/audio, configurable quality, storage management |
| **Local DB** | SQLite (rusqlite / sql.js) | Subscriptions, queue, history, episode links, instances, podcasts |
| **Sync (Optional)** | WebRTC / Syncthing | Local-first, encrypted, no cloud dependency |

**One binary. No microservices. No cloud required.**

---

## Step 2: Database Schema (SQLite)

```sql
-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- ============================
-- USERS & PREFERENCES
-- ============================
CREATE TABLE users (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE user_preferences (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    default_instance_id TEXT REFERENCES instances(id) ON DELETE SET NULL,
    default_format TEXT NOT NULL DEFAULT 'unified' CHECK (default_format IN ('video','audio','unified')),
    queue_behavior TEXT NOT NULL DEFAULT 'play_next' CHECK (queue_behavior IN ('play_next','add_end')),
    audio_only_default INTEGER NOT NULL DEFAULT 0,
    auto_download_wifi INTEGER NOT NULL DEFAULT 1,
    sponsorblock_enabled INTEGER NOT NULL DEFAULT 1,
    sponsorblock_categories TEXT NOT NULL DEFAULT '["sponsor","selfpromo","interaction","intro","outro","preview"]',
    keyboard_shortcuts_enabled INTEGER NOT NULL DEFAULT 1,
    theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('dark','light','system')),
    audio_only_default INTEGER NOT NULL DEFAULT 0,
    cross_device_sync_enabled INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================
-- INSTANCES (Invidious/Piped Pool)
-- ============================
CREATE TABLE instances (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    url TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK (type IN ('invidious','piped')),
    health TEXT NOT NULL DEFAULT 'unknown' CHECK (health IN ('healthy','degraded','failed','unknown')),
    latency_ms INTEGER,
    last_checked TEXT,
    auto_failover INTEGER NOT NULL DEFAULT 1,
    supports_sabr INTEGER NOT NULL DEFAULT 0,
    supports_age_restricted INTEGER NOT NULL DEFAULT 0,
    region TEXT,
    country TEXT,
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_instances_health ON instances(health);
CREATE INDEX idx_instances_pinned ON instances(pinned);

CREATE TABLE instance_health_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    checked_at TEXT NOT NULL DEFAULT (datetime('now')),
    latency_ms INTEGER,
    status TEXT NOT NULL CHECK (status IN ('healthy','degraded','failed')),
    error_message TEXT,
    video_id_tested TEXT,
    FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE CASCADE
);

CREATE INDEX idx_instance_health_log_instance ON instance_health_log(instance_id);
CREATE INDEX idx_instance_health_log_checked ON instance_health_log(checked_at);

-- ============================
-- CHANNELS (YouTube + Podcasts)
-- ============================
CREATE TABLE channels (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL, -- YouTube channel ID or podcast feed URL
    title TEXT NOT NULL,
    handle TEXT,
    thumbnail_url TEXT,
    description TEXT,
    subscriber_count INTEGER,
    is_subscribed INTEGER NOT NULL DEFAULT 1,
    subscribed_at TEXT NOT NULL DEFAULT (datetime('now')),
    notifications_enabled INTEGER NOT NULL DEFAULT 1,
    format_preference TEXT NOT NULL DEFAULT 'both' CHECK (format_preference IN ('video','audio','both')),
    instance_id TEXT REFERENCES instances(id) ON DELETE SET NULL,
    type TEXT NOT NULL DEFAULT 'video' CHECK (type IN ('video','podcast','both')),
    podcast_feed_url TEXT, -- for podcast type
    podcast_guid TEXT, -- podcast GUID for matching
    last_fetched_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, external_id)
);

CREATE INDEX idx_channels_user ON channels(user_id);
CREATE INDEX idx_channels_subscribed ON channels(user_id, is_subscribed);
CREATE INDEX idx_channels_type ON channels(type);

-- ============================
-- EPISODES / VIDEOS (Unified)
-- ============================
CREATE TABLE episodes (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL, -- YouTube video ID or podcast episode GUID
    title TEXT NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    duration_seconds INTEGER,
    published_at TEXT,
    url TEXT,
    video_id TEXT, -- YouTube video ID
    podcast_guid TEXT, -- podcast episode GUID
    episode_number INTEGER,
    season_number INTEGER,
    audio_url TEXT,
    video_url TEXT,
    formats TEXT, -- JSON array of available formats
    chapters TEXT, -- JSON array
    sponsors TEXT, -- JSON array from SponsorBlock
    transcript_url TEXT,
    is_downloaded INTEGER NOT NULL DEFAULT 0,
    download_quality TEXT,
    progress_seconds REAL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(channel_id, external_id)
);

CREATE INDEX idx_episodes_channel ON episodes(channel_id);
CREATE INDEX idx_episodes_published ON episodes(published_at DESC);
CREATE INDEX idx_episodes_downloaded ON episodes(is_downloaded);
CREATE INDEX idx_episodes_video_id ON episodes(video_id);
CREATE INDEX idx_episodes_podcast_guid ON episodes(podcast_guid);

-- Full-text search for episodes
CREATE VIRTUAL TABLE episodes_fts USING fts5(
    title, description, channel_id,
    content='episodes', content_rowid='rowid'
);

CREATE TRIGGER episodes_ai AFTER INSERT ON episodes BEGIN
    INSERT INTO episodes_fts(rowid, title, description, channel_id) VALUES (new.rowid, new.title, new.description, new.channel_id);
END;
CREATE TRIGGER episodes_ad AFTER DELETE ON episodes BEGIN
    INSERT INTO episodes_fts(episodes_fts, rowid, title, description, channel_id) VALUES ('delete', old.rowid, old.title, old.description, old.channel_id);
END;
CREATE TRIGGER episodes_au AFTER UPDATE ON episodes BEGIN
    INSERT INTO episodes_fts(episodes_fts, rowid, title, description, channel_id) VALUES ('delete', old.rowid, old.title, old.description, old.channel_id);
    INSERT INTO episodes_fts(rowid, title, description, channel_id) VALUES (new.rowid, new.title, new.description, new.channel_id);
END;

-- ============================
-- SMART EPISODE LINKS (Audio ↔ Video)
-- ============================
CREATE TABLE episode_links (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    podcast_guid TEXT NOT NULL,
    youtube_video_id TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0.0 CHECK (confidence >= 0.0 AND confidence <= 1.0),
    matched_at TEXT NOT NULL DEFAULT (datetime('now')),
    matched_by TEXT NOT NULL DEFAULT 'auto' CHECK (matched_by IN ('auto','manual')),
    title_similarity REAL,
    date_diff_days INTEGER,
    duration_diff_seconds INTEGER,
    user_confirmed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(podcast_guid, youtube_video_id)
);

CREATE INDEX idx_episode_links_podcast ON episode_links(podcast_guid);
CREATE INDEX idx_episode_links_youtube ON episode_links(youtube_video_id);
CREATE INDEX idx_episode_links_confidence ON episode_links(confidence);

-- ============================
-- QUEUE (Unified Video + Audio)
-- ============================
CREATE TABLE queues (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    current_index INTEGER NOT NULL DEFAULT 0,
    repeat_mode TEXT NOT NULL DEFAULT 'off' CHECK (repeat_mode IN ('off','one','all')),
    shuffle INTEGER NOT NULL DEFAULT 0,
    audio_only_mode INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE queue_items (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    queue_id TEXT NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
    episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    added_at TEXT NOT NULL DEFAULT (datetime('now')),
    source TEXT NOT NULL DEFAULT 'feed' CHECK (source IN ('feed','search','manual','history','smart_link')),
    play_mode TEXT NOT NULL DEFAULT 'unified' CHECK (play_mode IN ('video','audio','unified')),
    smart_link_id TEXT REFERENCES episode_links(id) ON DELETE SET NULL,
    UNIQUE(queue_id, position)
);

CREATE INDEX idx_queue_items_queue ON queue_items(queue_id);
CREATE INDEX idx_queue_items_position ON queue_items(queue_id, position);
CREATE INDEX idx_queue_items_episode ON queue_items(episode_id);

-- ============================
-- PLAYBACK STATE
-- ============================
CREATE TABLE playback_state (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL,
    position_seconds REAL NOT NULL DEFAULT 0,
    duration_seconds REAL,
    playback_rate REAL NOT NULL DEFAULT 1.0,
    volume REAL NOT NULL DEFAULT 1.0,
    is_audio_mode INTEGER NOT NULL DEFAULT 0,
    is_pip INTEGER NOT NULL DEFAULT 0,
    current_instance_id TEXT REFERENCES instances(id) ON DELETE SET NULL,
    last_updated TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================
-- DOWNLOADS
-- ============================
CREATE TABLE downloads (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    quality TEXT NOT NULL,
    format TEXT NOT NULL, -- 'video' or 'audio'
    file_path TEXT NOT NULL,
    file_size INTEGER,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','downloading','completed','failed','cancelled')),
    progress REAL NOT NULL DEFAULT 0.0,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
);

CREATE INDEX idx_downloads_episode ON downloads(episode_id);
CREATE INDEX idx_downloads_status ON downloads(status);

-- ============================
-- HISTORY / CONTINUE WATCHING
-- ============================
CREATE TABLE history (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    position_seconds REAL NOT NULL DEFAULT 0,
    duration_seconds REAL,
    completed INTEGER NOT NULL DEFAULT 0,
    played_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
);

CREATE INDEX idx_history_user ON history(user_id, played_at DESC);
CREATE INDEX idx_history_episode ON history(episode_id);

-- ============================
-- PODCAST FEEDS (RSS/Atom/JSON)
-- ============================
CREATE TABLE podcast_feeds (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feed_url TEXT NOT NULL,
    title TEXT,
    description TEXT,
    thumbnail_url TEXT,
    link TEXT,
    language TEXT,
    author TEXT,
    categories TEXT, -- JSON array
    last_fetched_at TEXT,
    last_episode_published_at TEXT,
    fetch_interval_minutes INTEGER NOT NULL DEFAULT 60,
    auto_download INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, feed_url)
);

CREATE INDEX idx_podcast_feeds_user ON podcast_feeds(user_id);

-- ============================
-- SPONSORBLOCK CACHE
-- ============================
CREATE TABLE sponsorblock_segments (
    video_id TEXT PRIMARY KEY,
    segments TEXT NOT NULL, -- JSON array of segments
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
);

CREATE INDEX idx_sponsorblock_expires ON sponsorblock_segments(expires_at);

-- ============================
-- KEYBOARD SHORTCUTS
-- ============================
CREATE TABLE keyboard_shortcuts (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    key_combination TEXT NOT NULL,
    context TEXT NOT NULL DEFAULT 'global' CHECK (context IN ('global','player','queue','feed')),
    enabled INTEGER NOT NULL DEFAULT 1,
    is_custom INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, action, context)
);

CREATE INDEX idx_keyboard_shortcuts_user ON keyboard_shortcuts(user_id);
```

---

## Step 3: API Routes (Tauri Commands)

| Method | Path | Description | Input | Output |
|--------|------|-------------|-------|--------|
| **Instance Pool** |
| GET | `instances:list` | List all instances with health | — | `Instance[]` |
| POST | `instances:add` | Add new instance | `{url, type}` | `Instance` |
| DELETE | `instances:remove` | Remove instance | `{id}` | `void` |
| POST | `instances:test` | Test instance health | `{id}` | `InstanceHealth` |
| POST | `instances:failover` | Trigger manual failover | `{from_id, to_id}` | `void` |
| **Channels / Subscriptions** |
| GET | `channels:list` | List user's subscriptions | `{type?, filter?}` | `Channel[]` |
| POST | `channels:subscribe` | Subscribe to channel | `{external_id, type, instance_id?}` | `Channel` |
| DELETE | `channels:unsubscribe` | Unsubscribe | `{channel_id}` | `void` |
| POST | `channels:import` | Import from YouTube/OPML | `{source, data}` | `{imported, errors}` |
| GET | `channels:export` | Export subscriptions | `{format: 'json'|'opml'}` | `string` |
| **Episodes / Videos** |
| GET | `episodes:feed` | Chronological feed | `{type?, filter?, limit?, offset?}` | `Episode[]` |
| GET | `episodes:get` | Get episode detail | `{episode_id}` | `Episode` |
| GET | `episodes:search` | Unified search | `{q, type?, filters?}` | `Episode[]` |
| GET | `episodes:stream` | Get stream URL | `{episode_id, format?, quality?}` | `{url, headers, format}` |
| **Queue** |
| GET | `queue:get` | Get current queue | — | `Queue` |
| POST | `queue:add` | Add to queue | `{episode_id, mode?, position?}` | `QueueItem` |
| POST | `queue:reorder` | Reorder queue | `{from, to}` | `void` |
| DELETE | `queue:remove` | Remove from queue | `{item_id}` | `void` |
| POST | `queue:clear` | Clear queue | — | `void` |
| POST | `queue:play-next` | Play next | `{episode_id}` | `void` |
| **Playback** |
| GET | `playback:state` | Get current state | — | `PlaybackState` |
| POST | `playback:update` | Update position/rate | `{position?, rate?, volume?, audio_mode?}` | `void` |
| POST | `playback:toggle-audio` | Toggle audio/video mode | `{episode_id}` | `void` |
| POST | `playback:smart-link` | Switch via smart link | `{link_id}` | `void` |
| **Smart Episode Linking** |
| GET | `smart-links:list` | List all matches | `{confidence_min?}` | `EpisodeLink[]` |
| POST | `smart-links:match` | Trigger background match | — | `{matched_count}` |
| POST | `smart-links:confirm` | Confirm match | `{link_id, confirmed}` | `void` |
| DELETE | `smart-links:unlink` | Remove match | `{link_id}` | `void` |
| **Instances** |
| GET | `instances:health` | Get health dashboard | — | `InstanceHealth[]` |
| POST | `instances:auto-failover` | Toggle auto-failover | `{enabled}` | `void` |
| **Downloads** |
| POST | `downloads:start` | Start download | `{episode_id, quality, format}` | `Download` |
| GET | `downloads:list` | List downloads | `{status?}` | `Download[]` |
| DELETE | `downloads:cancel` | Cancel download | `{id}` | `void` |
| DELETE | `downloads:delete` | Delete downloaded file | `{id}` | `void` |
| **Settings** |
| GET | `settings:get` | Get user preferences | — | `UserPreferences` |
| POST | `settings:update` | Update preferences | `Partial<UserPreferences>` | `void` |
| **History** |
| GET | `history:list` | Get watch history | `{limit?, offset?}` | `History[]` |
| DELETE | `history:clear` | Clear history | — | `void` |
| **Downloads** |
| GET | `downloads:list` | List downloads | `{status?}` | `Download[]` |
| **Keyboard Shortcuts** |
| GET | `shortcuts:list` | List shortcuts | — | `KeyboardShortcut[]` |
| POST | `shortcuts:update` | Update shortcut | `{action, key, context}` | `void` |
| **Background Jobs (Internal)** |
| JOB | `background:instance-health` | Every 5 min | — | Updates instance health |
| JOB | `background:smart-link` | WiFi + charging | — | Runs episode matcher |
| JOB | `background:feed-fetch` | Per feed interval | — | Fetches podcast feeds |
| JOB | `background:sponsorblock-sync` | Daily | — | Sync SponsorBlock cache |
| JOB | `background:cleanup` | Daily | — | Clean old downloads, history, logs |

---

## Step 4: The Parts That Bite

| Risk | Mitigation |
|------|------------|
| **Instance Pool Reliability** | Health checks every 5 min, latency-based routing, pinned instances, manual override, graceful degradation (show cached thumbnails, queue locally) |
| **Client-Side SABR** | yt-dlp handles extraction; Shaka Player for DASH/MSE playback; fallback to Invidious HLS if SABR fails; test matrix across instances |
| **Smart Episode Linking Accuracy** | Multi-factor matching (title fuzzy + date ±3d + duration ±10%), confidence threshold (0.8 auto, 0.5 manual), user override, feedback loop |
| **Background Audio Lifecycle** | Tauri media-session plugin + native iOS/Android background modes; handle: OS kill, Bluetooth disconnect, phone call interrupt, other app audio focus |
| **Instance Failover Mid-Playback** | Detect 403/404/timeout → pause → switch instance → resume from position; buffer 10s ahead |
| **Background Episode Matching** | Only on WiFi + charging (configurable); respects battery saver; uses Invidious pool for search; stores in local SQLite |
| **SponsorBlock Sync** | Cache segments locally (24h TTL); fallback to API; respect user categories; submit corrections |
| **OPML Import/Export** | Handle malformed XML, duplicate feeds, GUID conflicts, merge strategy (keep latest), progress reporting |
| **Offline Downloads** | yt-dlp for extraction; store in app sandbox; manage storage quota; resume interrupted downloads; cleanup policy |
| **Background Audio Lifecycle** | MediaSession API (web) + native plugins (iOS: AVPlayer + background modes; Android: MediaSession + foreground service) |
| **Cross-Platform WebView Quirks** | Tauri uses system WebView (WebView2 on Windows, WebKit on macOS/Linux, WebView on Android, WKWebView on iOS); test CSS/JS compatibility |
| **SQLite Concurrency** | WAL mode; connection pooling in Rust; migrations via embedded SQL |
| **yt-dlp Updates** | Bundle specific version; auto-check for updates weekly; fallback to Invidious if extraction fails |
| **Rate Limits / IP Blocks** | Instance pool rotates IPs; exponential backoff; user-agent rotation; residential proxy support (optional) |
| **GDPR / Data Deletion** | All data local; "Delete All Data" command wipes SQLite + files; no cloud sync by default |
| **Accessibility** | WCAG AA contrast; keyboard navigation; screen reader labels; prefers-reduced-motion; high contrast mode |

---

## Step 5: Build Order

### Milestone 1: Vertical Slice (Week 1-2)
**Goal:** Tauri app → Instance pool → Play one video → Play one podcast → Unified queue

| Screens | Tables | Routes |
|---------|--------|--------|
| S01 (Onboarding), S02 (Feed), S03 (Video), S04 (Audio), S05 (Queue), S14 (Player), S15 (Mini) | users, user_preferences, instances, channels, episodes, queues, queue_items, playback_state | instances:list, instances:add, instances:test, channels:subscribe, episodes:feed, episodes:stream, queue:get, queue:add, playback:state, playback:update |

**Proof:** Add channel → appears in feed → play video → play podcast → add to queue → reorder → background audio works.

---

### Milestone 2: Must-Haves (Week 3-6)

| Area | Screens | Tables | Key Routes |
|------|---------|--------|------------|
| **Instance Pool** | S09, S17 | instances, instance_health_log | instances:list, add, test, failover, health |
| **Smart Episode Linking** | S11, S18 | episode_links | smart-links:list, match, confirm, unlink |
| **Instance Pool Auto-Failover** | S03, S04, S09 | instances, instance_health_log | background:instance-health, instances:failover |
| **Client-Side SABR** | S03, S14 | episodes (formats) | episodes:stream |
| **SponsorBlock** | S14 | sponsorblock_segments | episodes:stream (includes segments) |
| **Background Audio** | S14, S15 | playback_state | playback:update, background audio plugin |
| **Audio-Only Mode** | S04, S15 | playback_state, queues | playback:toggle-audio |
| **PiP (Reliable)** | S14 | playback_state | — (native) |
| **Keyboard Shortcuts** | S16 | keyboard_shortcuts | shortcuts:list, update |

---

### Milestone 3: Should-Haves (Week 7-10)

| Area | Screens | Tables | Key Routes |
|------|---------|--------|------------|
| **Smart Episode Linking (Full)** | S11, S18 | episode_links | smart-links:match, confirm, unlink, bulk |
| **Instance Pool Dashboard** | S17 | instance_health_log | instances:health |
| **Offline Downloads** | S13 | downloads | downloads:start, list, cancel |
| **OPML Import/Export** | S10 | podcast_feeds | channels:import, export |
| **YouTube Subscription Import** | S01, S10 | channels, subscription_import | channels:import |
| **OPML Import/Export** | S10 | podcast_feeds | channels:import, export |
| **Background Audio Lifecycle** | S14, S15 | playback_state | — (native plugin) |
| **PiP (Reliable)** | S14 | playback_state | — |
| **Offline Downloads** | S13 | downloads | downloads:start, list, cancel |
| **Storage Management** | S13 | downloads, episodes | background:cleanup |
| **History / Continue Watching** | S12 | history | history:list, clear |
| **Search (Unified)** | S07 | episodes_fts | episodes:search |
| **Feed Filters** | S02 | channels | episodes:feed (with filter) |
| **Channel Page Tabs** | S06 | channels, episodes | channels:list (with type filter) |
| **Keyboard Shortcuts Help** | S16 | keyboard_shortcuts | shortcuts:list |
| **Instance Manual Override** | S09 | instances | instances:add (with pinned) |

---

### Milestone 4: Could-Haves + Fixes (Week 11-14)

| Area | Screens | Tables | Key Routes |
|------|---------|--------|------------|
| **Cross-Device Sync (Optional)** | — | — | WebRTC/Syncthing |
| **SponsorBlock Submissions** | S14 | sponsorblock_segments | POST to API |
| **Smart Link Bulk Import** | S11 | episode_links | smart-links:match (history) |
| **Episode Link Export/Import** | S11 | episode_links | export/import JSON |
| **Cross-Device Queue Sync** | — | queues | WebRTC/Syncthing |
| **Custom Keyboard Shortcuts** | S16 | keyboard_shortcuts | shortcuts:update (is_custom) |
| **SponsorBlock Categories Config** | S08 | user_preferences | settings:update |
| **Sleep Timer + Fade** | S04, S15 | playback_state | playback:update |
| **Position Sync on Switch** | S03, S04 | playback_state, episode_links | playback:smart-link |
| **Background Audio Lifecycle (Full)** | S14, S15 | playback_state | native plugin |
| **Auto-Download on WiFi** | S13 | downloads, podcast_feeds | background:feed-fetch |
| **Storage Cleanup** | S13 | downloads, episodes | background:cleanup |
| **Smart Link Bulk Actions** | S18 | episode_links | bulk confirm/unlink |
| **Episode Link Export/Import** | S11 | episode_links | export/import |
| **Custom Keyboard Shortcuts** | S16 | keyboard_shortcuts | shortcuts:update (is_custom) |

---

## Step 6: Risk Summary

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Google blocks all Invidious/Piped instances | High | Critical | Instance pool + pinned residential proxies + yt-dlp fallback |
| SABR breaks across all instances | Medium | High | yt-dlp extraction + Shaka fallback + HLS fallback |
| Episode matching accuracy < 80% | Medium | Medium | Multi-factor matching + user feedback loop + manual override |
| Background audio killed by OS | Medium | High | Native plugins + foreground service (Android) + background modes (iOS) |
| yt-dlp breaks with YouTube changes | Medium | High | Weekly update check + Invidious fallback + bundled version pin |
| SQLite corruption / migration issues | Low | High | WAL mode + embedded migrations + backup/restore |
| Tauri WebView compatibility issues | Low | Medium | Test matrix: WebView2, WebKit, WKWebView, Android WebView |

---

## Summary

- **Stack:** Tauri + React + Rust + SQLite + yt-dlp + Invidious pool
- **Tables:** 18 core tables + FTS + indexes
- **Routes:** ~50 Tauri commands + 4 background jobs
- **Top 3 Risks:** Instance pool reliability, SABR support, Episode matching accuracy
- **Next Step:** `/replica-design` → design tokens, components, then `/replica-build`
