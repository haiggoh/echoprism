-- EchoPrism Database Schema
-- 18 tables for unified YouTube + Podcast client

-- Users
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- User Preferences
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id TEXT PRIMARY KEY,
    default_instance_id TEXT,
    default_format TEXT NOT NULL DEFAULT 'unified',
    queue_behavior TEXT NOT NULL DEFAULT 'play_next',
    audio_only_default BOOLEAN NOT NULL DEFAULT 0,
    auto_download_wifi BOOLEAN NOT NULL DEFAULT 1,
    sponsorblock_enabled BOOLEAN NOT NULL DEFAULT 1,
    sponsorblock_categories TEXT NOT NULL DEFAULT '["sponsor","selfpromo","interaction","intro","outro"]',
    keyboard_shortcuts_enabled BOOLEAN NOT NULL DEFAULT 1,
    theme TEXT NOT NULL DEFAULT 'system',
    cross_device_sync_enabled BOOLEAN NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Instances (Invidious/Piped)
CREATE TABLE IF NOT EXISTS instances (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('invidious', 'piped')),
    health TEXT NOT NULL DEFAULT 'unknown' CHECK (health IN ('healthy', 'degraded', 'failed', 'unknown')),
    latency_ms INTEGER,
    last_checked TEXT,
    auto_failover BOOLEAN NOT NULL DEFAULT 1,
    supports_sabr BOOLEAN NOT NULL DEFAULT 0,
    supports_age_restricted BOOLEAN NOT NULL DEFAULT 0,
    region TEXT,
    country TEXT,
    pinned BOOLEAN NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Instance Health Logs
CREATE TABLE IF NOT EXISTS instance_health_logs (
    id TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL,
    health TEXT NOT NULL CHECK (health IN ('healthy', 'degraded', 'failed', 'unknown')),
    latency_ms INTEGER,
    error_message TEXT,
    checked_at TEXT NOT NULL,
    FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE CASCADE
);

-- Channels/Subscriptions
CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    external_id TEXT NOT NULL,
    title TEXT NOT NULL,
    handle TEXT,
    thumbnail_url TEXT,
    description TEXT,
    subscriber_count INTEGER,
    is_subscribed BOOLEAN NOT NULL DEFAULT 1,
    subscribed_at TEXT NOT NULL,
    notifications_enabled BOOLEAN NOT NULL DEFAULT 1,
    format_preference TEXT NOT NULL DEFAULT 'unified',
    instance_id TEXT,
    type TEXT NOT NULL DEFAULT 'both' CHECK (type IN ('video', 'podcast', 'both')),
    podcast_feed_url TEXT,
    podcast_guid TEXT,
    last_fetched_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE SET NULL,
    UNIQUE (user_id, external_id, instance_id)
);

-- Episodes/Videos
CREATE TABLE IF NOT EXISTS episodes (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
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
    is_downloaded BOOLEAN NOT NULL DEFAULT 0,
    download_quality TEXT,
    progress_seconds REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
    UNIQUE (channel_id, external_id)
);

-- Episode Links (Smart Episode Linking)
CREATE TABLE IF NOT EXISTS episode_links (
    id TEXT PRIMARY KEY,
    podcast_guid TEXT NOT NULL,
    youtube_video_id TEXT NOT NULL,
    confidence REAL NOT NULL,
    matched_at TEXT NOT NULL,
    matched_by TEXT NOT NULL CHECK (matched_by IN ('auto', 'manual')),
    title_similarity REAL,
    date_diff_days INTEGER,
    duration_diff_seconds INTEGER,
    user_confirmed BOOLEAN NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (podcast_guid, youtube_video_id)
);

-- Queues
CREATE TABLE IF NOT EXISTS queues (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    current_index INTEGER NOT NULL DEFAULT 0,
    repeat_mode TEXT NOT NULL DEFAULT 'off' CHECK (repeat_mode IN ('off', 'one', 'all')),
    shuffle BOOLEAN NOT NULL DEFAULT 0,
    audio_only_mode BOOLEAN NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Queue Items
CREATE TABLE IF NOT EXISTS queue_items (
    id TEXT PRIMARY KEY,
    queue_id TEXT NOT NULL,
    episode_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    added_at TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'feed' CHECK (source IN ('feed', 'search', 'manual', 'history', 'smart_link')),
    play_mode TEXT NOT NULL DEFAULT 'unified' CHECK (play_mode IN ('video', 'audio', 'unified')),
    smart_link_id TEXT,
    FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE,
    FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
    FOREIGN KEY (smart_link_id) REFERENCES episode_links(id) ON DELETE SET NULL
);

-- Playback State
CREATE TABLE IF NOT EXISTS playback_state (
    user_id TEXT PRIMARY KEY,
    episode_id TEXT,
    position_seconds REAL NOT NULL DEFAULT 0,
    duration_seconds REAL,
    playback_rate REAL NOT NULL DEFAULT 1.0,
    volume REAL NOT NULL DEFAULT 1.0,
    is_audio_mode BOOLEAN NOT NULL DEFAULT 0,
    is_pip BOOLEAN NOT NULL DEFAULT 0,
    current_instance_id TEXT,
    last_updated TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE SET NULL,
    FOREIGN KEY (current_instance_id) REFERENCES instances(id) ON DELETE SET NULL
);

-- Downloads
CREATE TABLE IF NOT EXISTS downloads (
    id TEXT PRIMARY KEY,
    episode_id TEXT NOT NULL,
    quality TEXT NOT NULL,
    format TEXT NOT NULL CHECK (format IN ('video', 'audio')),
    file_path TEXT NOT NULL,
    file_size INTEGER,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'downloading', 'completed', 'failed', 'cancelled')),
    progress REAL NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
);

-- History
CREATE TABLE IF NOT EXISTS history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    episode_id TEXT NOT NULL,
    position_seconds REAL NOT NULL,
    duration_seconds REAL,
    completed BOOLEAN NOT NULL DEFAULT 0,
    played_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
);

-- Podcast Feeds
CREATE TABLE IF NOT EXISTS podcast_feeds (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
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
    auto_download BOOLEAN NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (user_id, feed_url)
);

-- SponsorBlock Segments
CREATE TABLE IF NOT EXISTS sponsorblock_segments (
    video_id TEXT PRIMARY KEY,
    segments TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

-- Keyboard Shortcuts
CREATE TABLE IF NOT EXISTS keyboard_shortcuts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    key_combination TEXT NOT NULL,
    context TEXT NOT NULL CHECK (context IN ('global', 'player', 'queue', 'feed')),
    enabled BOOLEAN NOT NULL DEFAULT 1,
    is_custom BOOLEAN NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (user_id, action, context)
);

-- Settings (generic key-value for future use)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);