-- EchoPrism Database Indexes

-- Instances
CREATE INDEX IF NOT EXISTS idx_instances_health ON instances(health);
CREATE INDEX IF NOT EXISTS idx_instances_type ON instances(type);
CREATE INDEX IF NOT EXISTS idx_instances_pinned ON instances(pinned);
CREATE INDEX IF NOT EXISTS idx_instances_last_checked ON instances(last_checked);

-- Instance Health Logs
CREATE INDEX IF NOT EXISTS idx_instance_health_logs_instance_id ON instance_health_logs(instance_id);
CREATE INDEX IF NOT EXISTS idx_instance_health_logs_checked_at ON instance_health_logs(checked_at);

-- Channels
CREATE INDEX IF NOT EXISTS idx_channels_user_id ON channels(user_id);
CREATE INDEX IF NOT EXISTS idx_channels_instance_id ON channels(instance_id);
CREATE INDEX IF NOT EXISTS idx_channels_type ON channels(type);
CREATE INDEX IF NOT EXISTS idx_channels_is_subscribed ON channels(is_subscribed);
CREATE INDEX IF NOT EXISTS idx_channels_external_id ON channels(external_id);
CREATE INDEX IF NOT EXISTS idx_channels_subscribed_at ON channels(subscribed_at);

-- Episodes
CREATE INDEX IF NOT EXISTS idx_episodes_channel_id ON episodes(channel_id);
CREATE INDEX IF NOT EXISTS idx_episodes_published_at ON episodes(published_at);
CREATE INDEX IF NOT EXISTS idx_episodes_video_id ON episodes(video_id);
CREATE INDEX IF NOT EXISTS idx_episodes_podcast_guid ON episodes(podcast_guid);
CREATE INDEX IF NOT EXISTS idx_episodes_is_downloaded ON episodes(is_downloaded);
CREATE INDEX IF NOT EXISTS idx_episodes_external_id ON episodes(external_id);

-- Episode Links
CREATE INDEX IF NOT EXISTS idx_episode_links_podcast_guid ON episode_links(podcast_guid);
CREATE INDEX IF NOT EXISTS idx_episode_links_youtube_video_id ON episode_links(youtube_video_id);
CREATE INDEX IF NOT EXISTS idx_episode_links_confidence ON episode_links(confidence);
CREATE INDEX IF NOT EXISTS idx_episode_links_user_confirmed ON episode_links(user_confirmed);

-- Queues
CREATE INDEX IF NOT EXISTS idx_queues_user_id ON queues(user_id);

-- Queue Items
CREATE INDEX IF NOT EXISTS idx_queue_items_queue_id ON queue_items(queue_id);
CREATE INDEX IF NOT EXISTS idx_queue_items_episode_id ON queue_items(episode_id);
CREATE INDEX IF NOT EXISTS idx_queue_items_position ON queue_items(position);
CREATE INDEX IF NOT EXISTS idx_queue_items_smart_link_id ON queue_items(smart_link_id);

-- Playback State
CREATE INDEX IF NOT EXISTS idx_playback_state_user_id ON playback_state(user_id);
CREATE INDEX IF NOT EXISTS idx_playback_state_episode_id ON playback_state(episode_id);

-- Downloads
CREATE INDEX IF NOT EXISTS idx_downloads_episode_id ON downloads(episode_id);
CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
CREATE INDEX IF NOT EXISTS idx_downloads_created_at ON downloads(created_at);

-- History
CREATE INDEX IF NOT EXISTS idx_history_user_id ON history(user_id);
CREATE INDEX IF NOT EXISTS idx_history_episode_id ON history(episode_id);
CREATE INDEX IF NOT EXISTS idx_history_played_at ON history(played_at);

-- Podcast Feeds
CREATE INDEX IF NOT EXISTS idx_podcast_feeds_user_id ON podcast_feeds(user_id);
CREATE INDEX IF NOT EXISTS idx_podcast_feeds_is_active ON podcast_feeds(is_active);
CREATE INDEX IF NOT EXISTS idx_podcast_feeds_last_fetched_at ON podcast_feeds(last_fetched_at);

-- SponsorBlock Segments
CREATE INDEX IF NOT EXISTS idx_sponsorblock_segments_fetched_at ON sponsorblock_segments(fetched_at);
CREATE INDEX IF NOT EXISTS idx_sponsorblock_segments_expires_at ON sponsorblock_segments(expires_at);

-- Keyboard Shortcuts
CREATE INDEX IF NOT EXISTS idx_keyboard_shortcuts_user_id ON keyboard_shortcuts(user_id);
CREATE INDEX IF NOT EXISTS idx_keyboard_shortcuts_action ON keyboard_shortcuts(action);
CREATE INDEX IF NOT EXISTS idx_keyboard_shortcuts_context ON keyboard_shortcuts(context);

-- Settings
CREATE INDEX IF NOT EXISTS idx_settings_updated_at ON settings(updated_at);