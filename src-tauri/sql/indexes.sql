-- Indexes for EchoPrism database

-- Episode indexes
CREATE INDEX IF NOT EXISTS idx_episodes_channel ON episodes(channel_id);
CREATE INDEX IF NOT EXISTS idx_episodes_published ON episodes(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_downloaded ON episodes(is_downloaded);
CREATE INDEX IF NOT EXISTS idx_episodes_video_id ON episodes(video_id);
CREATE INDEX IF NOT EXISTS idx_episodes_podcast_guid ON episodes(podcast_guid);

-- Queue indexes
CREATE INDEX IF NOT EXISTS idx_queue_items_queue ON queue_items(queue_id);
CREATE INDEX IF NOT EXISTS idx_queue_items_position ON queue_items(queue_id, position);
CREATE INDEX IF NOT EXISTS idx_queue_items_episode ON queue_items(episode_id);

-- Channel indexes
CREATE INDEX IF NOT EXISTS idx_channels_user ON channels(user_id);
CREATE INDEX IF NOT EXISTS idx_channels_subscribed ON channels(user_id, is_subscribed);
CREATE INDEX IF NOT EXISTS idx_channels_type ON channels(type);

-- Instance indexes
CREATE INDEX IF NOT EXISTS idx_instances_health ON instances(health);
CREATE INDEX IF NOT EXISTS idx_instances_pinned ON instances(pinned);

-- Instance health log indexes
CREATE INDEX IF NOT EXISTS idx_instance_health_log_instance ON instance_health_log(instance_id);
CREATE INDEX IF NOT EXISTS idx_instance_health_log_checked ON instance_health_log(checked_at);

-- Episode link indexes
CREATE INDEX IF NOT EXISTS idx_episode_links_podcast ON episode_links(podcast_guid);
CREATE INDEX IF NOT EXISTS idx_episode_links_youtube ON episode_links(youtube_video_id);
CREATE INDEX IF NOT EXISTS idx_episode_links_confidence ON episode_links(confidence);

-- Play-mode rule indexes (D7: rules are listed and evaluated per channel)
CREATE INDEX IF NOT EXISTS idx_play_mode_rules_channel ON play_mode_rules(channel_id, priority DESC);

-- Download indexes
CREATE INDEX IF NOT EXISTS idx_downloads_episode ON downloads(episode_id);
CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);

-- History indexes
CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_episode ON history(episode_id);

-- Podcast feed indexes
CREATE INDEX IF NOT EXISTS idx_podcast_feeds_user ON podcast_feeds(user_id);

-- SponsorBlock indexes
CREATE INDEX IF NOT EXISTS idx_sponsorblock_expires ON sponsorblock_segments(expires_at);

-- Keyboard shortcuts indexes
CREATE INDEX IF NOT EXISTS idx_keyboard_shortcuts_user ON keyboard_shortcuts(user_id);
