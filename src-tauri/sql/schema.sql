-- EchoPrism Database Schema
-- SQLite schema for unified video & podcast player

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ============================
-- USERS & PREFERENCES
-- ============================
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_preferences (
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
    cross_device_sync_enabled INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================
-- INSTANCES (Invidious/Piped Pool)
-- ============================
CREATE TABLE IF NOT EXISTS instances (
    id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
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

CREATE INDEX IF NOT EXISTS idx_instances_health ON instances(health);
CREATE INDEX IF NOT EXISTS idx_instances_pinned ON instances(pinned);

CREATE TABLE IF NOT EXISTS instance_health_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    checked_at TEXT NOT NULL DEFAULT (datetime('now')),
    latency_ms INTEGER,
    status TEXT NOT NULL CHECK (status IN ('healthy','degraded','failed')),
    error_message TEXT,
    video_id_tested TEXT,
    FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_instance_health_log_instance ON instance_health_log(instance_id);
CREATE INDEX IF NOT EXISTS idx_instance_health_log_checked ON instance_health_log(checked_at);

-- ============================
-- CHANNELS (YouTube + Podcasts)
-- ============================
CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
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
    podcast_feed_url TEXT,
    podcast_guid TEXT,
    last_fetched_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_channels_user ON channels(user_id);
CREATE INDEX IF NOT EXISTS idx_channels_subscribed ON channels(user_id, is_subscribed);
CREATE INDEX IF NOT EXISTS idx_channels_type ON channels(type);

-- ============================
-- EPISODES / VIDEOS (Unified)
-- ============================
CREATE TABLE IF NOT EXISTS episodes (
    id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    duration_seconds INTEGER,
    published_at TEXT,
    url TEXT,
    video_id TEXT,
    podcast_guid TEXT,
    episode_number INTEGER,
    season_number INTEGER,
    audio_url TEXT,
    video_url TEXT,
    formats TEXT,
    chapters TEXT,
    sponsors TEXT,
    transcript_url TEXT,
    is_downloaded INTEGER NOT NULL DEFAULT 0,
    download_quality TEXT,
    progress_seconds REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(channel_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_episodes_channel ON episodes(channel_id);
CREATE INDEX IF NOT EXISTS idx_episodes_published ON episodes(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_downloaded ON episodes(is_downloaded);
CREATE INDEX IF NOT EXISTS idx_episodes_video_id ON episodes(video_id);
CREATE INDEX IF NOT EXISTS idx_episodes_podcast_guid ON episodes(podcast_guid);

-- Full-text search for episodes
CREATE VIRTUAL TABLE IF NOT EXISTS episodes_fts USING fts5(
    title, description, channel_id,
    content='episodes', content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS episodes_ai AFTER INSERT ON episodes BEGIN
    INSERT INTO episodes_fts(rowid, title, description, channel_id) VALUES (new.rowid, new.title, new.description, new.channel_id);
END;

CREATE TRIGGER IF NOT EXISTS episodes_ad AFTER DELETE ON episodes BEGIN
    INSERT INTO episodes_fts(episodes_fts, rowid, title, description, channel_id) VALUES ('delete', old.rowid, old.title, old.description, old.channel_id);
END;

CREATE TRIGGER IF NOT EXISTS episodes_au AFTER UPDATE ON episodes BEGIN
    INSERT INTO episodes_fts(episodes_fts, rowid, title, description, channel_id) VALUES ('delete', old.rowid, old.title, old.description, old.channel_id);
    INSERT INTO episodes_fts(rowid, title, description, channel_id) VALUES (new.rowid, new.title, new.description, new.channel_id);
END;

-- ============================
-- SMART EPISODE LINKS (Audio ↔ Video)
-- ============================
CREATE TABLE IF NOT EXISTS episode_links (
    id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
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

CREATE INDEX IF NOT EXISTS idx_episode_links_podcast ON episode_links(podcast_guid);
CREATE INDEX IF NOT EXISTS idx_episode_links_youtube ON episode_links(youtube_video_id);
CREATE INDEX IF NOT EXISTS idx_episode_links_confidence ON episode_links(confidence);

-- ============================
-- QUEUE (Unified Video + Audio)
-- ============================
CREATE TABLE IF NOT EXISTS queues (
    id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    current_index INTEGER NOT NULL DEFAULT 0,
    repeat_mode TEXT NOT NULL DEFAULT 'off' CHECK (repeat_mode IN ('off','one','all')),
    shuffle INTEGER NOT NULL DEFAULT 0,
    audio_only_mode INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS queue_items (
    id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
    queue_id TEXT NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
    episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    added_at TEXT NOT NULL DEFAULT (datetime('now')),
    source TEXT NOT NULL DEFAULT 'feed' CHECK (source IN ('feed','search','manual','history','smart_link')),
    play_mode TEXT NOT NULL DEFAULT 'unified' CHECK (play_mode IN ('video','audio','unified')),
    smart_link_id TEXT REFERENCES episode_links(id) ON DELETE SET NULL,
    UNIQUE(queue_id, position)
);

CREATE INDEX IF NOT EXISTS idx_queue_items_queue ON queue_items(queue_id);
CREATE INDEX IF NOT EXISTS idx_queue_items_position ON queue_items(queue_id, position);
CREATE INDEX IF NOT EXISTS idx_queue_items_episode ON queue_items(episode_id);

-- ============================
-- PLAYBACK STATE
-- ============================
CREATE TABLE IF NOT EXISTS playback_state (
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
CREATE TABLE IF NOT EXISTS downloads (
    id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
    episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    quality TEXT NOT NULL,
    format TEXT NOT NULL CHECK (format IN ('video','audio')),
    file_path TEXT NOT NULL,
    file_size INTEGER,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','downloading','completed','failed','cancelled')),
    progress REAL NOT NULL DEFAULT 0.0,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_downloads_episode ON downloads(episode_id);
CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);

-- ============================
-- HISTORY / CONTINUE WATCHING
-- ============================
CREATE TABLE IF NOT EXISTS history (
    id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    position_seconds REAL NOT NULL DEFAULT 0,
    duration_seconds REAL,
    completed INTEGER NOT NULL DEFAULT 0,
    played_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_episode ON history(episode_id);

-- ============================
-- PODCAST FEEDS (RSS/Atom/JSON)
-- ============================
CREATE TABLE IF NOT EXISTS podcast_feeds (
    id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feed_url TEXT NOT NULL,
    title TEXT,
    description TEXT,
    thumbnail_url TEXT,
    link TEXT,
    language TEXT,
    author TEXT,
    categories TEXT,
    last_fetched_at TEXT,
    last_episode_published_at TEXT,
    fetch_interval_minutes INTEGER NOT NULL DEFAULT 60,
    auto_download INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, feed_url)
);

CREATE INDEX IF NOT EXISTS idx_podcast_feeds_user ON podcast_feeds(user_id);

-- ============================
-- SPONSORBLOCK CACHE
-- ============================
CREATE TABLE IF NOT EXISTS sponsorblock_segments (
    video_id TEXT PRIMARY KEY,
    segments TEXT NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sponsorblock_expires ON sponsorblock_segments(expires_at);

-- ============================
-- KEYBOARD SHORTCUTS
-- ============================
CREATE TABLE IF NOT EXISTS keyboard_shortcuts (
    id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
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

CREATE INDEX IF NOT EXISTS idx_keyboard_shortcuts_user ON keyboard_shortcuts(user_id);

-- ============================
-- SPONSORBLOCK CACHE
-- ============================
CREATE TABLE IF NOT EXISTS sponsorblock_segments (
    video_id TEXT PRIMARY KEY,
    segments TEXT NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sponsorblock_expires ON sponsorblock_segments(expires_at);

-- ============================
-- KEYBOARD SHORTCUTS
-- ============================
CREATE TABLE IF NOT EXISTS keyboard_shortcuts (
    id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
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

CREATE INDEX IF NOT EXISTS idx_keyboard_shortcuts_user ON keyboard_shortcuts(user_id);
