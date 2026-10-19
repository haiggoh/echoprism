//! Database module

pub mod migrations;
pub mod queries;

use crate::types::*;
use crate::db::queries::DbResult;
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use tauri::Manager;

#[derive(Clone)]
pub struct Database {
    pool: SqlitePool,
}

impl Database {
    pub async fn new(app_handle: &tauri::AppHandle) -> DbResult<Self> {
        let app_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?;

        std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;

        let db_path = app_dir.join("echoprism.db");
        let database_url = format!("sqlite://{}?mode=rwc", db_path.display());

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_lazy(&database_url)
            .map_err(|e| e.to_string())?;

        let db = Self { pool };
        db.migrate().await?;

        Ok(db)
    }

    async fn migrate(&self) -> DbResult<()> {
        migrations::run(&self.pool).await
    }

    // Instance methods
    pub async fn list_instances(&self) -> DbResult<Vec<Instance>> {
        queries::list_instances(&self.pool).await
    }

    pub async fn insert_instance(&self, instance: &Instance) -> DbResult<()> {
        queries::insert_instance(&self.pool, instance).await
    }

    pub async fn delete_instance(&self, id: &str) -> DbResult<()> {
        queries::delete_instance(&self.pool, id).await
    }

    // Channel methods
    pub async fn list_channels(&self, params: Option<crate::commands::channels::ChannelListParams>) -> DbResult<Vec<Channel>> {
        queries::list_channels(&self.pool, params).await
    }

    pub async fn insert_channel(&self, channel: &Channel) -> DbResult<()> {
        queries::insert_channel(&self.pool, channel).await
    }

    pub async fn delete_channel(&self, id: &str) -> DbResult<()> {
        queries::delete_channel(&self.pool, id).await
    }

    // Episode methods
    // D6: the three choice surfaces resolve smart links at READ time (same
    // behavior as the mock layer) — any episode the user picks arrives
    // already link-matched to its cross-stream twin.
    pub async fn get_feed(&self, params: Option<crate::commands::episodes::FeedParams>) -> DbResult<Vec<Episode>> {
        let mut episodes = queries::get_feed(&self.pool, params).await?;
        queries::resolve_smart_links(&self.pool, &mut episodes).await?;
        Ok(episodes)
    }

    pub async fn get_episode(&self, episode_id: &str) -> DbResult<Episode> {
        let mut episode = queries::get_episode(&self.pool, episode_id).await?;
        queries::resolve_smart_links(&self.pool, std::slice::from_mut(&mut episode)).await?;
        Ok(episode)
    }

    pub async fn search_episodes(
        &self,
        query: String,
        params: Option<crate::commands::episodes::SearchParams>,
    ) -> DbResult<Vec<Episode>> {
        let mut episodes = queries::search_episodes(&self.pool, query, params).await?;
        queries::resolve_smart_links(&self.pool, &mut episodes).await?;
        Ok(episodes)
    }

    // Queue methods
    pub async fn get_queue(&self) -> DbResult<Queue> {
        queries::get_queue(&self.pool).await
    }

    pub async fn add_to_queue(
        &self,
        episode_id: String,
        mode: Option<PlayMode>,
        position: Option<usize>,
    ) -> DbResult<QueueItem> {
        queries::add_to_queue(&self.pool, episode_id, mode, position).await
    }

    pub async fn reorder_queue(&self, from: usize, to: usize) -> DbResult<()> {
        queries::reorder_queue(&self.pool, from, to).await
    }

    pub async fn remove_from_queue(&self, item_id: &str) -> DbResult<()> {
        queries::remove_from_queue(&self.pool, item_id).await
    }

    pub async fn clear_queue(&self) -> DbResult<()> {
        queries::clear_queue(&self.pool).await
    }

    pub async fn play_next(&self, episode_id: String) -> DbResult<()> {
        queries::play_next(&self.pool, episode_id).await
    }

    // Episode links
    pub async fn list_episode_links(&self, confidence_min: Option<f64>) -> DbResult<Vec<EpisodeLink>> {
        queries::list_episode_links(&self.pool, confidence_min).await
    }

    // Play-mode rules (D7)
    pub async fn list_play_mode_rules(&self, channel_id: Option<String>) -> DbResult<Vec<PlayModeRule>> {
        queries::list_play_mode_rules(&self.pool, channel_id).await
    }

    pub async fn set_play_mode_rule(
        &self,
        channel_id: String,
        title_pattern: String,
        play_mode: PlayMode,
        priority: Option<i64>,
    ) -> DbResult<PlayModeRule> {
        queries::set_play_mode_rule(&self.pool, channel_id, title_pattern, play_mode, priority).await
    }

    pub async fn remove_play_mode_rule(&self, rule_id: &str) -> DbResult<()> {
        queries::remove_play_mode_rule(&self.pool, rule_id).await
    }

    // Matcher methods
    pub async fn get_unmatched_podcasts(&self) -> DbResult<Vec<PodcastEpisode>> {
        queries::get_unmatched_podcasts(&self.pool).await
    }

    pub async fn get_youtube_videos(&self) -> DbResult<Vec<YoutubeVideo>> {
        queries::get_youtube_videos(&self.pool).await
    }

    pub async fn insert_episode_link(&self, link: &EpisodeLink) -> DbResult<()> {
        queries::insert_episode_link(&self.pool, link).await
    }

    // Preferences
    pub async fn get_preferences(&self) -> DbResult<UserPreferences> {
        queries::get_preferences(&self.pool).await
    }

    pub async fn update_preferences(&self, prefs: UserPreferences) -> DbResult<()> {
        queries::update_preferences(&self.pool, prefs).await
    }

    // Playback state
    pub async fn get_playback_state(&self) -> DbResult<PlaybackState> {
        queries::get_playback_state(&self.pool).await
    }

    pub async fn update_playback_state(&self, params: crate::commands::playback::PlaybackUpdateParams) -> DbResult<()> {
        queries::update_playback_state(&self.pool, params).await
    }

    // Downloads
    pub async fn list_downloads(&self, status: Option<String>) -> DbResult<Vec<Download>> {
        queries::list_downloads(&self.pool, status).await
    }

    // History
    pub async fn list_history(&self, limit: Option<u32>, offset: Option<u32>) -> DbResult<Vec<HistoryEntry>> {
        queries::list_history(&self.pool, limit, offset).await
    }

    pub async fn clear_history(&self) -> DbResult<()> {
        queries::clear_history(&self.pool).await
    }

    // Keyboard shortcuts
    pub async fn list_shortcuts(&self) -> DbResult<Vec<KeyboardShortcut>> {
        queries::list_shortcuts(&self.pool).await
    }

    pub async fn update_shortcut(&self, action: String, key: String, context: String) -> DbResult<()> {
        queries::update_shortcut(&self.pool, action, key, context).await
    }
}