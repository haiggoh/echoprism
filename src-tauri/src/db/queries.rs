//! Database queries

use crate::types::*;
use sqlx::{SqlitePool, Row, FromRow, query_as, query};
use chrono::Utc;
use std::collections::HashMap;

// Local Result type for database queries
pub type DbResult<T> = std::result::Result<T, String>;

pub async fn list_instances(pool: &SqlitePool) -> DbResult<Vec<Instance>> {
    query_as!(
        Instance,
        r#"SELECT id, url, type as "instance_type: _", health as "health: _",
              latency_ms as "latency_ms: Option<i64>", last_checked as "last_checked: Option<String>",
              auto_failover, supports_sabr, supports_age_restricted,
              region as "region: Option<String>", country as "country: Option<String>",
              pinned, created_at, updated_at
           FROM instances ORDER BY pinned DESC, last_checked DESC"#
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

pub async fn insert_instance(pool: &SqlitePool, instance: &Instance) -> DbResult<()> {
    let instance_type_str = instance.instance_type.to_string();
    let health_str = instance.health.to_string();
    query!(
        r#"INSERT INTO instances (id, url, type, health, latency_ms, last_checked,
              auto_failover, supports_sabr, supports_age_restricted, region, country,
              pinned, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
        instance.id,
        instance.url,
        instance_type_str,
        health_str,
        instance.latency_ms,
        instance.last_checked,
        instance.auto_failover,
        instance.supports_sabr,
        instance.supports_age_restricted,
        instance.region,
        instance.country,
        instance.pinned,
        instance.created_at,
        instance.updated_at,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn delete_instance(pool: &SqlitePool, id: &str) -> DbResult<()> {
    query!("DELETE FROM instances WHERE id = ?", id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn list_channels(
    pool: &SqlitePool,
    params: Option<crate::commands::channels::ChannelListParams>,
) -> DbResult<Vec<Channel>> {
    let channel_type = params.and_then(|p| p.channel_type);

    if let Some(ct) = channel_type {
        query_as!(
            Channel,
            r#"SELECT id, user_id, external_id, title, handle, thumbnail_url, description,
                  subscriber_count as "subscriber_count: Option<i64>", is_subscribed, subscribed_at, notifications_enabled,
                  format_preference as "format_preference: _", instance_id as "instance_id: Option<String>",
                  type as "channel_type: _", podcast_feed_url as "podcast_feed_url: Option<String>",
                  podcast_guid as "podcast_guid: Option<String>", last_fetched_at as "last_fetched_at: Option<String>",
                  created_at, updated_at
               FROM channels
               WHERE type = ?
               ORDER BY subscribed_at DESC"#,
            ct.to_string()
        )
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())
    } else {
        query_as!(
            Channel,
            r#"SELECT id, user_id, external_id, title, handle, thumbnail_url, description,
                  subscriber_count as "subscriber_count: Option<i64>", is_subscribed, subscribed_at, notifications_enabled,
                  format_preference as "format_preference: _", instance_id as "instance_id: Option<String>",
                  type as "channel_type: _", podcast_feed_url as "podcast_feed_url: Option<String>",
                  podcast_guid as "podcast_guid: Option<String>", last_fetched_at as "last_fetched_at: Option<String>",
                  created_at, updated_at
               FROM channels
               ORDER BY subscribed_at DESC"#
        )
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())
    }
}

pub async fn insert_channel(pool: &SqlitePool, channel: &Channel) -> DbResult<()> {
    let format_pref = channel.format_preference.to_string();
    let channel_type_str = channel.channel_type.to_string();
    query!(
        r#"INSERT INTO channels (id, user_id, external_id, title, handle, thumbnail_url,
              description, subscriber_count, is_subscribed, subscribed_at,
              notifications_enabled, format_preference, instance_id, type,
              podcast_feed_url, podcast_guid, last_fetched_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
        channel.id,
        channel.user_id,
        channel.external_id,
        channel.title,
        channel.handle,
        channel.thumbnail_url,
        channel.description,
        channel.subscriber_count,
        channel.is_subscribed,
        channel.subscribed_at,
        channel.notifications_enabled,
        format_pref,
        channel.instance_id,
        channel_type_str,
        channel.podcast_feed_url,
        channel.podcast_guid,
        channel.last_fetched_at,
        channel.created_at,
        channel.updated_at,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn delete_channel(pool: &SqlitePool, id: &str) -> DbResult<()> {
    query!("DELETE FROM channels WHERE id = ?", id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn get_feed(
    pool: &SqlitePool,
    params: Option<crate::commands::episodes::FeedParams>,
) -> DbResult<Vec<Episode>> {
    let ep_type = params.as_ref().and_then(|p| p.episode_type.as_deref());
    let limit = params.as_ref().and_then(|p| p.limit).unwrap_or(50);
    let offset = params.unwrap_or_default().offset.unwrap_or(0);

    if let Some(et) = ep_type {
        query_as!(
            Episode,
            r#"SELECT e.id, e.channel_id, e.external_id, e.title, e.description, e.thumbnail_url,
                  e.duration_seconds as "duration_seconds: Option<i64>", e.published_at as "published_at: Option<String>",
                  e.url as "url: Option<String>", e.video_id as "video_id: Option<String>", e.podcast_guid as "podcast_guid: Option<String>",
                  e.episode_number as "episode_number: Option<i64>", e.season_number as "season_number: Option<i64>",
                  e.audio_url as "audio_url: Option<String>", e.video_url as "video_url: Option<String>",
                  e.formats as "formats: Option<String>", e.chapters as "chapters: Option<String>",
                  e.sponsors as "sponsors: Option<String>", e.transcript_url as "transcript_url: Option<String>",
                  e.is_downloaded, e.download_quality as "download_quality: Option<String>",
                  e.progress_seconds, e.created_at, e.updated_at
               FROM episodes e
               JOIN channels c ON e.channel_id = c.id
               WHERE c.type = ?
               ORDER BY e.published_at DESC
               LIMIT ? OFFSET ?"#,
            et,
            limit as i64,
            offset as i64
        )
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())
    } else {
        query_as!(
            Episode,
            r#"SELECT e.id, e.channel_id, e.external_id, e.title, e.description, e.thumbnail_url,
                  e.duration_seconds as "duration_seconds: Option<i64>", e.published_at as "published_at: Option<String>",
                  e.url as "url: Option<String>", e.video_id as "video_id: Option<String>", e.podcast_guid as "podcast_guid: Option<String>",
                  e.episode_number as "episode_number: Option<i64>", e.season_number as "season_number: Option<i64>",
                  e.audio_url as "audio_url: Option<String>", e.video_url as "video_url: Option<String>",
                  e.formats as "formats: Option<String>", e.chapters as "chapters: Option<String>",
                  e.sponsors as "sponsors: Option<String>", e.transcript_url as "transcript_url: Option<String>",
                  e.is_downloaded, e.download_quality as "download_quality: Option<String>",
                  e.progress_seconds, e.created_at, e.updated_at
               FROM episodes e
               ORDER BY e.published_at DESC
               LIMIT ? OFFSET ?"#,
            limit as i64,
            offset as i64
        )
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())
    }
}

pub async fn get_episode(pool: &SqlitePool, episode_id: &str) -> DbResult<Episode> {
    query_as!(
        Episode,
        r#"SELECT id, channel_id, external_id, title, description, thumbnail_url,
              duration_seconds as "duration_seconds: Option<i64>", published_at as "published_at: Option<String>",
              url as "url: Option<String>", video_id as "video_id: Option<String>", podcast_guid as "podcast_guid: Option<String>",
              episode_number as "episode_number: Option<i64>", season_number as "season_number: Option<i64>",
              audio_url as "audio_url: Option<String>", video_url as "video_url: Option<String>",
              formats as "formats: Option<String>", chapters as "chapters: Option<String>",
              sponsors as "sponsors: Option<String>", transcript_url as "transcript_url: Option<String>",
              is_downloaded, download_quality as "download_quality: Option<String>",
              progress_seconds, created_at, updated_at
           FROM episodes WHERE id = ?"#,
        episode_id
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Episode not found".to_string())
}

pub async fn search_episodes(
    pool: &SqlitePool,
    query_str: String,
    params: Option<crate::commands::episodes::SearchParams>,
) -> DbResult<Vec<Episode>> {
    let limit = params.as_ref().and_then(|p| p.limit).unwrap_or(50);

    query_as!(
        Episode,
        r#"SELECT e.id, e.channel_id, e.external_id, e.title, e.description, e.thumbnail_url,
              e.duration_seconds, e.published_at, e.url, e.video_id, e.podcast_guid,
              e.episode_number, e.season_number, e.audio_url, e.video_url, e.formats,
              e.chapters, e.sponsors, e.transcript_url, e.is_downloaded, e.download_quality,
              e.progress_seconds, e.created_at, e.updated_at
           FROM episodes e
           JOIN episodes_fts fts ON e.rowid = fts.rowid
           WHERE episodes_fts MATCH ?
           ORDER BY e.published_at DESC
           LIMIT ?"#,
        query_str,
        limit as i64
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

pub async fn get_queue(pool: &SqlitePool) -> DbResult<Queue> {
    let row = query!(
        "SELECT id, user_id, current_index, repeat_mode, shuffle, audio_only_mode, created_at, updated_at
         FROM queues WHERE user_id = 'current-user' LIMIT 1"
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some(row) = row {
        let items = query_as!(
            QueueItem,
            "SELECT id, queue_id, episode_id, position, added_at, source as \"source\", play_mode as \"play_mode\", smart_link_id
             FROM queue_items WHERE queue_id = ? ORDER BY position",
            row.id
        )
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

        Ok(Queue {
            id: row.id,
            user_id: row.user_id,
            current_index: row.current_index,
            repeat_mode: row.repeat_mode,
            shuffle: row.shuffle,
            audio_only_mode: row.audio_only_mode,
            created_at: row.created_at,
            updated_at: row.updated_at,
            items,
        })
    } else {
        let now = chrono::Utc::now().to_rfc3339();
        let queue = Queue {
            id: uuid::Uuid::new_v4().to_string(),
            user_id: "current-user".to_string(),
            current_index: 0,
            repeat_mode: RepeatMode::Off,
            shuffle: false,
            audio_only_mode: false,
            created_at: now.clone(),
            updated_at: now,
            items: vec![],
        };
        query!(
            "INSERT INTO queues (id, user_id, current_index, repeat_mode, shuffle, audio_only_mode, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            queue.id, queue.user_id, queue.current_index, queue.repeat_mode as RepeatMode,
            queue.shuffle, queue.audio_only_mode, now.clone(), now
        ).execute(pool).await.map_err(|e| e.to_string())?;
        Ok(queue)
    }
}

pub async fn add_to_queue(
    pool: &SqlitePool,
    episode_id: String,
    mode: Option<PlayMode>,
    position: Option<usize>,
) -> DbResult<QueueItem> {
    let queue = get_queue(pool).await?;

    let pos = position.unwrap_or(queue.items.len()) as i64;
    let added_at = chrono::Utc::now().to_rfc3339();
    let source_str = QueueSource::Feed.to_string();
    let play_mode_str = mode.unwrap_or(PlayMode::Unified).to_string();
    let item = QueueItem {
        id: uuid::Uuid::new_v4().to_string(),
        queue_id: queue.id.clone(),
        episode_id,
        position: pos,
        added_at,
        source: QueueSource::Feed,
        play_mode: mode.unwrap_or(PlayMode::Unified),
        smart_link_id: None,
    };

    query!(
        "INSERT INTO queue_items (id, queue_id, episode_id, position, added_at, source, play_mode, smart_link_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        item.id, item.queue_id, item.episode_id, item.position, item.added_at, source_str, play_mode_str, item.smart_link_id
    ).execute(pool).await.map_err(|e| e.to_string())?;

    Ok(item)
}

pub async fn reorder_queue(pool: &SqlitePool, from: usize, to: usize) -> DbResult<()> {
    let from_i64 = from as i64;
    let to_i64 = to as i64;
    query!(
        "UPDATE queue_items SET position = CASE
            WHEN position = ? THEN ?
            WHEN position > ? AND position <= ? THEN position - 1
            WHEN position < ? AND position >= ? THEN position + 1
            ELSE position END
         WHERE queue_id = (SELECT id FROM queues WHERE user_id = 'current-user')",
        from_i64, to_i64, from_i64, to_i64, from_i64, to_i64
    ).execute(pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn remove_from_queue(pool: &SqlitePool, item_id: &str) -> DbResult<()> {
    query!("DELETE FROM queue_items WHERE id = ?", item_id)
        .execute(pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn clear_queue(pool: &SqlitePool) -> DbResult<()> {
    query!("DELETE FROM queue_items WHERE queue_id = (SELECT id FROM queues WHERE user_id = 'current-user')")
        .execute(pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn play_next(pool: &SqlitePool, episode_id: String) -> DbResult<()> {
    let queue = get_queue(pool).await?;
    let pos = (queue.current_index + 1) as usize;
    add_to_queue(pool, episode_id, None, Some(pos)).await?;
    Ok(())
}

pub async fn list_episode_links(pool: &SqlitePool, confidence_min: Option<f64>) -> DbResult<Vec<EpisodeLink>> {
    let min_conf = confidence_min.unwrap_or(0.0);
    query_as!(EpisodeLink, "SELECT id, podcast_guid, youtube_video_id, confidence, matched_at, matched_by as \"matched_by\", title_similarity, date_diff_days, duration_diff_seconds, user_confirmed, created_at, updated_at FROM episode_links WHERE confidence >= ? ORDER BY confidence DESC", min_conf)
        .fetch_all(pool).await.map_err(|e| e.to_string())
}

pub async fn get_preferences(pool: &SqlitePool) -> DbResult<UserPreferences> {
    query_as!(
        UserPreferences,
        "SELECT user_id, default_instance_id, default_format as \"default_format: _\", queue_behavior as \"queue_behavior: _\", audio_only_default, auto_download_wifi, sponsorblock_enabled, sponsorblock_categories, keyboard_shortcuts_enabled, theme as \"theme: _\", cross_device_sync_enabled, updated_at as \"updated_at: _\"
         FROM user_preferences WHERE user_id = 'current-user'"
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Preferences not found".to_string())
}

pub async fn update_preferences(pool: &SqlitePool, prefs: UserPreferences) -> DbResult<()> {
    let cats_json = serde_json::to_string(&prefs.sponsorblock_categories).unwrap_or_default();
    query!(
        "UPDATE user_preferences SET default_format = ?, queue_behavior = ?, audio_only_default = ?, auto_download_wifi = ?, sponsorblock_enabled = ?, sponsorblock_categories = ?, keyboard_shortcuts_enabled = ?, theme = ?, cross_device_sync_enabled = ?, updated_at = ? WHERE user_id = 'current-user'",
        prefs.default_format as Format,
        prefs.queue_behavior as QueueBehavior,
        prefs.audio_only_default,
        prefs.auto_download_wifi,
        prefs.sponsorblock_enabled,
        cats_json,
        prefs.keyboard_shortcuts_enabled,
        prefs.theme as Theme,
        prefs.cross_device_sync_enabled,
        chrono::Utc::now().to_rfc3339()
    ).execute(pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn get_playback_state(pool: &SqlitePool) -> DbResult<PlaybackState> {
    query_as!(
        PlaybackState,
        "SELECT user_id, episode_id, position_seconds, duration_seconds, playback_rate, volume, is_audio_mode, is_pip, current_instance_id, last_updated
         FROM playback_state WHERE user_id = 'current-user'"
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "No playback state".to_string())
    .map(|state| PlaybackState {
        last_updated: DateTimeUtc::from(state.last_updated),
        ..state
    })
}

pub async fn update_playback_state(pool: &SqlitePool, params: crate::commands::playback::PlaybackUpdateParams) -> DbResult<()> {
    let now = chrono::Utc::now().to_rfc3339();
    query!(
        "UPDATE playback_state SET position_seconds = COALESCE(?, position_seconds), duration_seconds = COALESCE(?, duration_seconds), playback_rate = COALESCE(?, playback_rate), volume = COALESCE(?, volume), is_audio_mode = COALESCE(?, is_audio_mode), is_pip = COALESCE(?, is_pip), current_instance_id = COALESCE(?, current_instance_id), last_updated = ? WHERE user_id = 'current-user'",
        params.position, params.position, params.rate, params.volume, params.audio_mode, params.audio_mode, params.position, now
    ).execute(pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn list_history(pool: &SqlitePool, limit: Option<u32>, offset: Option<u32>) -> DbResult<Vec<HistoryEntry>> {
    let limit = limit.unwrap_or(50);
    let offset = offset.unwrap_or(0);
    query_as!(
        HistoryEntry,
        "SELECT id, user_id, episode_id, position_seconds, duration_seconds, completed, played_at FROM history WHERE user_id = 'current-user' ORDER BY played_at DESC LIMIT ? OFFSET ?",
        limit as i64, offset as i64
    )
    .fetch_all(pool).await.map_err(|e| e.to_string())
}

pub async fn clear_history(pool: &SqlitePool) -> DbResult<()> {
    query!("DELETE FROM history WHERE user_id = 'current-user'").execute(pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn list_downloads(pool: &SqlitePool, status: Option<String>) -> DbResult<Vec<Download>> {
    if let Some(status) = status {
        query_as!(
            Download,
            "SELECT id, episode_id, quality, format, file_path, file_size, status, progress, error_message, created_at, completed_at FROM downloads WHERE status = ? ORDER BY created_at DESC",
            status
        )
        .fetch_all(pool).await.map_err(|e| e.to_string())
    } else {
        query_as!(
            Download,
            "SELECT id, episode_id, quality, format, file_path, file_size, status, progress, error_message, created_at, completed_at FROM downloads ORDER BY created_at DESC"
        )
        .fetch_all(pool).await.map_err(|e| e.to_string())
    }
}

pub async fn list_shortcuts(pool: &SqlitePool) -> DbResult<Vec<KeyboardShortcut>> {
    query_as!(KeyboardShortcut, "SELECT id, user_id, action, key_combination, context as \"context: _\", enabled, is_custom, created_at, updated_at FROM keyboard_shortcuts WHERE user_id = 'current-user'")
        .fetch_all(pool).await.map_err(|e| e.to_string())
        .map(|shortcuts| shortcuts.into_iter().map(|s| KeyboardShortcut {
            created_at: DateTimeUtc::from(s.created_at),
            updated_at: DateTimeUtc::from(s.updated_at),
            ..s
        }).collect())
}

pub async fn update_shortcut(pool: &SqlitePool, action: String, key: String, context: String) -> DbResult<()> {
    let now = DateTimeUtc::new(DateTimeUtc::new(chrono::Utc::now())).to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();
    query!("INSERT OR REPLACE INTO keyboard_shortcuts (id, user_id, action, key_combination, context, enabled, is_custom, created_at, updated_at) VALUES (?, 'current-user', ?, ?, ?, 1, 0, ?, ?)",
        id, action, key, context, now, now
    ).execute(pool).await.map_err(|e| e.to_string())?;
    Ok(())
}