//! Database queries

use crate::types::*;
use sqlx::{SqlitePool, Row, FromRow, query_as, query};
use chrono::Utc;
use std::collections::HashMap;

// Local Result type for database queries
pub type DbResult<T> = std::result::Result<T, String>;

pub async fn list_instances(pool: &SqlitePool) -> DbResult<Vec<Instance>> {
    #[derive(sqlx::FromRow)]
    struct InstanceRow {
        id: String,
        url: String,
        instance_type: InstanceType,
        health: InstanceHealth,
        latency_ms: Option<i64>,
        last_checked: Option<String>,
        auto_failover: i64,
        supports_sabr: i64,
        supports_age_restricted: i64,
        region: Option<String>,
        country: Option<String>,
        pinned: i64,
        created_at: String,
        updated_at: String,
    }

    let rows = sqlx::query_as!(
        InstanceRow,
        r#"SELECT
            id,
            url,
            type as "instance_type: _",
            health as "health: _",
            latency_ms,
            last_checked,
            auto_failover,
            supports_sabr,
            supports_age_restricted,
            region,
            country,
            pinned,
            created_at,
            updated_at
        FROM instances ORDER BY pinned DESC, last_checked DESC"#
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|r| Instance {
        id: r.id,
        url: r.url,
        instance_type: r.instance_type,
        health: r.health,
        latency_ms: r.latency_ms,
        last_checked: r.last_checked,
        auto_failover: r.auto_failover != 0,
        supports_sabr: r.supports_sabr != 0,
        supports_age_restricted: r.supports_age_restricted != 0,
        region: r.region,
        country: r.country,
        pinned: r.pinned != 0,
        created_at: r.created_at,
        updated_at: r.updated_at,
    }).collect())
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

    #[derive(sqlx::FromRow)]
    struct ChannelRow {
        id: String,
        user_id: String,
        external_id: String,
        title: String,
        handle: Option<String>,
        thumbnail_url: Option<String>,
        description: Option<String>,
        subscriber_count: Option<i64>,
        is_subscribed: i64,
        subscribed_at: String,
        notifications_enabled: i64,
        format_preference: Format,
        instance_id: Option<String>,
        channel_type: ChannelType,
        podcast_feed_url: Option<String>,
        podcast_guid: Option<String>,
        last_fetched_at: Option<String>,
        created_at: String,
        updated_at: String,
    }

    if let Some(ct) = channel_type {
        let ct_str = ct.to_string();
        let rows = sqlx::query_as!(
            ChannelRow,
            r#"SELECT
                id as "id: String",
                user_id as "user_id: String",
                external_id as "external_id: String",
                title as "title: String",
                handle as "handle: Option<String>",
                thumbnail_url as "thumbnail_url: Option<String>",
                description as "description: Option<String>",
                subscriber_count as "subscriber_count: Option<i64>",
                is_subscribed as "is_subscribed: i64",
                subscribed_at as "subscribed_at: String",
                notifications_enabled as "notifications_enabled: i64",
                format_preference as "format_preference: _",
                instance_id as "instance_id: Option<String>",
                type as "channel_type: _",
                podcast_feed_url as "podcast_feed_url: Option<String>",
                podcast_guid as "podcast_guid: Option<String>",
                last_fetched_at as "last_fetched_at: Option<String>",
                created_at as "created_at: String",
                updated_at as "updated_at: String"
             FROM channels
             WHERE type = ?
             ORDER BY subscribed_at DESC"#,
            ct_str
        )
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

        Ok(rows.into_iter().map(|r| Channel {
            id: r.id,
            user_id: r.user_id,
            external_id: r.external_id,
            title: r.title,
            handle: r.handle,
            thumbnail_url: r.thumbnail_url,
            description: r.description,
            subscriber_count: r.subscriber_count,
            is_subscribed: r.is_subscribed != 0,
            subscribed_at: r.subscribed_at,
            notifications_enabled: r.notifications_enabled != 0,
            format_preference: r.format_preference,
            instance_id: r.instance_id,
            channel_type: r.channel_type,
            podcast_feed_url: r.podcast_feed_url,
            podcast_guid: r.podcast_guid,
            last_fetched_at: r.last_fetched_at,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }).collect())
    } else {
        let rows = sqlx::query_as!(
            ChannelRow,
            r#"SELECT
                id as "id: String",
                user_id as "user_id: String",
                external_id as "external_id: String",
                title as "title: String",
                handle as "handle: Option<String>",
                thumbnail_url as "thumbnail_url: Option<String>",
                description as "description: Option<String>",
                subscriber_count as "subscriber_count: Option<i64>",
                is_subscribed as "is_subscribed: i64",
                subscribed_at as "subscribed_at: String",
                notifications_enabled as "notifications_enabled: i64",
                format_preference as "format_preference: _",
                instance_id as "instance_id: Option<String>",
                type as "channel_type: _",
                podcast_feed_url as "podcast_feed_url: Option<String>",
                podcast_guid as "podcast_guid: Option<String>",
                last_fetched_at as "last_fetched_at: Option<String>",
                created_at as "created_at: String",
                updated_at as "updated_at: String"
             FROM channels
             ORDER BY subscribed_at DESC"#
        )
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

        Ok(rows.into_iter().map(|r| Channel {
            id: r.id,
            user_id: r.user_id,
            external_id: r.external_id,
            title: r.title,
            handle: r.handle,
            thumbnail_url: r.thumbnail_url,
            description: r.description,
            subscriber_count: r.subscriber_count,
            is_subscribed: r.is_subscribed != 0,
            subscribed_at: r.subscribed_at,
            notifications_enabled: r.notifications_enabled != 0,
            format_preference: r.format_preference,
            instance_id: r.instance_id,
            channel_type: r.channel_type,
            podcast_feed_url: r.podcast_feed_url,
            podcast_guid: r.podcast_guid,
            last_fetched_at: r.last_fetched_at,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }).collect())
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

    #[derive(sqlx::FromRow)]
    struct EpisodeRow {
        id: String,
        channel_id: String,
        external_id: String,
        title: String,
        description: Option<String>,
        thumbnail_url: Option<String>,
        duration_seconds: Option<i64>,
        published_at: Option<String>,
        url: Option<String>,
        video_id: Option<String>,
        podcast_guid: Option<String>,
        episode_number: Option<i64>,
        season_number: Option<i64>,
        audio_url: Option<String>,
        video_url: Option<String>,
        formats: Option<String>,
        chapters: Option<String>,
        sponsors: Option<String>,
        transcript_url: Option<String>,
        is_downloaded: bool,
        download_quality: Option<String>,
        progress_seconds: f64,
        created_at: String,
        updated_at: String,
    }

    if let Some(et) = ep_type {
        let rows = sqlx::query_as!(
            EpisodeRow,
            r#"SELECT
                e.id,
                e.channel_id,
                e.external_id,
                e.title,
                e.description,
                e.thumbnail_url,
                e.duration_seconds,
                e.published_at,
                e.url,
                e.video_id,
                e.podcast_guid,
                e.episode_number,
                e.season_number,
                e.audio_url,
                e.video_url,
                e.formats,
                e.chapters,
                e.sponsors,
                e.transcript_url,
                e.is_downloaded,
                e.download_quality,
                e.progress_seconds,
                e.created_at,
                e.updated_at
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
        .map_err(|e| e.to_string())?;

        Ok(rows.into_iter().map(|r| Episode {
            id: r.id,
            channel_id: r.channel_id,
            external_id: r.external_id,
            title: r.title,
            description: r.description,
            thumbnail_url: r.thumbnail_url,
            duration_seconds: r.duration_seconds,
            published_at: r.published_at,
            url: r.url,
            video_id: r.video_id,
            podcast_guid: r.podcast_guid,
            episode_number: r.episode_number,
            season_number: r.season_number,
            audio_url: r.audio_url,
            video_url: r.video_url,
            formats: r.formats,
            chapters: r.chapters,
            sponsors: r.sponsors,
            transcript_url: r.transcript_url,
            is_downloaded: r.is_downloaded,
            download_quality: r.download_quality,
            progress_seconds: r.progress_seconds,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }).collect())
    } else {
        let rows = sqlx::query_as!(
            EpisodeRow,
            r#"SELECT
                e.id,
                e.channel_id,
                e.external_id,
                e.title,
                e.description,
                e.thumbnail_url,
                e.duration_seconds,
                e.published_at,
                e.url,
                e.video_id,
                e.podcast_guid,
                e.episode_number,
                e.season_number,
                e.audio_url,
                e.video_url,
                e.formats,
                e.chapters,
                e.sponsors,
                e.transcript_url,
                e.is_downloaded,
                e.download_quality,
                e.progress_seconds,
                e.created_at,
                e.updated_at
             FROM episodes e
             ORDER BY e.published_at DESC
             LIMIT ? OFFSET ?"#,
            limit as i64,
            offset as i64
        )
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

        Ok(rows.into_iter().map(|r| Episode {
            id: r.id,
            channel_id: r.channel_id,
            external_id: r.external_id,
            title: r.title,
            description: r.description,
            thumbnail_url: r.thumbnail_url,
            duration_seconds: r.duration_seconds,
            published_at: r.published_at,
            url: r.url,
            video_id: r.video_id,
            podcast_guid: r.podcast_guid,
            episode_number: r.episode_number,
            season_number: r.season_number,
            audio_url: r.audio_url,
            video_url: r.video_url,
            formats: r.formats,
            chapters: r.chapters,
            sponsors: r.sponsors,
            transcript_url: r.transcript_url,
            is_downloaded: r.is_downloaded,
            download_quality: r.download_quality,
            progress_seconds: r.progress_seconds,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }).collect())
    }
}

pub async fn get_episode(pool: &SqlitePool, episode_id: &str) -> DbResult<Episode> {
    #[derive(sqlx::FromRow)]
    struct EpisodeRow {
        id: String,
        channel_id: String,
        external_id: String,
        title: String,
        description: Option<String>,
        thumbnail_url: Option<String>,
        duration_seconds: Option<i64>,
        published_at: Option<String>,
        url: Option<String>,
        video_id: Option<String>,
        podcast_guid: Option<String>,
        episode_number: Option<i64>,
        season_number: Option<i64>,
        audio_url: Option<String>,
        video_url: Option<String>,
        formats: Option<String>,
        chapters: Option<String>,
        sponsors: Option<String>,
        transcript_url: Option<String>,
        is_downloaded: bool,
        download_quality: Option<String>,
        progress_seconds: f64,
        created_at: String,
        updated_at: String,
    }

    let row = sqlx::query_as!(
        EpisodeRow,
        r#"SELECT
            id,
            channel_id,
            external_id,
            title,
            description,
            thumbnail_url,
            duration_seconds,
            published_at,
            url,
            video_id,
            podcast_guid,
            episode_number,
            season_number,
            audio_url,
            video_url,
            formats,
            chapters,
            sponsors,
            transcript_url,
            is_downloaded,
            download_quality,
            progress_seconds,
            created_at,
            updated_at
         FROM episodes WHERE id = ?"#,
        episode_id
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Episode not found".to_string())?;

    Ok(Episode {
        id: row.id,
        channel_id: row.channel_id,
        external_id: row.external_id,
        title: row.title,
        description: row.description,
        thumbnail_url: row.thumbnail_url,
        duration_seconds: row.duration_seconds,
        published_at: row.published_at,
        url: row.url,
        video_id: row.video_id,
        podcast_guid: row.podcast_guid,
        episode_number: row.episode_number,
        season_number: row.season_number,
        audio_url: row.audio_url,
        video_url: row.video_url,
        formats: row.formats,
        chapters: row.chapters,
        sponsors: row.sponsors,
        transcript_url: row.transcript_url,
        is_downloaded: row.is_downloaded,
        download_quality: row.download_quality,
        progress_seconds: row.progress_seconds,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

pub async fn search_episodes(
    pool: &SqlitePool,
    query_str: String,
    params: Option<crate::commands::episodes::SearchParams>,
) -> DbResult<Vec<Episode>> {
    let limit = params.as_ref().and_then(|p| p.limit).unwrap_or(50);

    #[derive(sqlx::FromRow)]
    struct EpisodeRow {
        id: String,
        channel_id: String,
        external_id: String,
        title: String,
        description: Option<String>,
        thumbnail_url: Option<String>,
        duration_seconds: Option<i64>,
        published_at: Option<String>,
        url: Option<String>,
        video_id: Option<String>,
        podcast_guid: Option<String>,
        episode_number: Option<i64>,
        season_number: Option<i64>,
        audio_url: Option<String>,
        video_url: Option<String>,
        formats: Option<String>,
        chapters: Option<String>,
        sponsors: Option<String>,
        transcript_url: Option<String>,
        is_downloaded: bool,
        download_quality: Option<String>,
        progress_seconds: f64,
        created_at: String,
        updated_at: String,
    }

    let rows = sqlx::query_as!(
        EpisodeRow,
        r#"SELECT
            e.id,
            e.channel_id,
            e.external_id,
            e.title,
            e.description,
            e.thumbnail_url,
            e.duration_seconds,
            e.published_at,
            e.url,
            e.video_id,
            e.podcast_guid,
            e.episode_number,
            e.season_number,
            e.audio_url,
            e.video_url,
            e.formats,
            e.chapters,
            e.sponsors,
            e.transcript_url,
            e.is_downloaded,
            e.download_quality,
            e.progress_seconds,
            e.created_at,
            e.updated_at
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
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|r| Episode {
        id: r.id,
        channel_id: r.channel_id,
        external_id: r.external_id,
        title: r.title,
        description: r.description,
        thumbnail_url: r.thumbnail_url,
        duration_seconds: r.duration_seconds,
        published_at: r.published_at,
        url: r.url,
        video_id: r.video_id,
        podcast_guid: r.podcast_guid,
        episode_number: r.episode_number,
        season_number: r.season_number,
        audio_url: r.audio_url,
        video_url: r.video_url,
        formats: r.formats,
        chapters: r.chapters,
        sponsors: r.sponsors,
        transcript_url: r.transcript_url,
        is_downloaded: r.is_downloaded,
        download_quality: r.download_quality,
        progress_seconds: r.progress_seconds,
        created_at: r.created_at,
        updated_at: r.updated_at,
    }).collect())
}

pub async fn get_queue(pool: &SqlitePool) -> DbResult<Queue> {
    let row = query!(
        r#"SELECT
            id as "id: String",
            user_id as "user_id: String",
            current_index as "current_index: i64",
            repeat_mode as "repeat_mode: _",
            shuffle as "shuffle: bool",
            audio_only_mode as "audio_only_mode: bool",
            created_at as "created_at: String",
            updated_at as "updated_at: String"
         FROM queues WHERE user_id = 'current-user' LIMIT 1"#
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some(row) = row {
        #[derive(sqlx::FromRow)]
        struct QueueItemRow {
            id: String,
            queue_id: String,
            episode_id: String,
            position: i64,
            added_at: String,
            source: QueueSource,
            play_mode: PlayMode,
            smart_link_id: Option<String>,
        }

        let items = query_as!(
            QueueItemRow,
            r#"SELECT
                id,
                queue_id,
                episode_id,
                position,
                added_at,
                source as "source: _",
                play_mode as "play_mode: _",
                smart_link_id
             FROM queue_items WHERE queue_id = ? ORDER BY position"#,
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
            items: items.into_iter().map(|r| QueueItem {
                id: r.id,
                queue_id: r.queue_id,
                episode_id: r.episode_id,
                position: r.position,
                added_at: r.added_at,
                source: r.source,
                play_mode: r.play_mode,
                smart_link_id: r.smart_link_id,
            }).collect(),
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

    #[derive(sqlx::FromRow)]
    struct EpisodeLinkRow {
        id: String,
        podcast_guid: String,
        youtube_video_id: String,
        confidence: f64,
        matched_at: DateTimeUtc,
        matched_by: MatchSource,
        title_similarity: Option<f64>,
        date_diff_days: Option<i64>,
        duration_diff_seconds: Option<i64>,
        user_confirmed: bool,
        created_at: DateTimeUtc,
        updated_at: DateTimeUtc,
    }

    let rows = query_as!(
        EpisodeLinkRow,
        r#"SELECT
            id,
            podcast_guid,
            youtube_video_id,
            confidence,
            matched_at,
            matched_by,
            title_similarity,
            date_diff_days,
            duration_diff_seconds,
            user_confirmed,
            created_at,
            updated_at
         FROM episode_links WHERE confidence >= ? ORDER BY confidence DESC"#,
        min_conf
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|r| EpisodeLink {
        id: r.id,
        podcast_guid: r.podcast_guid,
        youtube_video_id: r.youtube_video_id,
        confidence: r.confidence,
        matched_at: r.matched_at,
        matched_by: r.matched_by,
        title_similarity: r.title_similarity,
        date_diff_days: r.date_diff_days,
        duration_diff_seconds: r.duration_diff_seconds,
        user_confirmed: r.user_confirmed,
        created_at: r.created_at,
        updated_at: r.updated_at,
    }).collect())
}

pub async fn get_preferences(pool: &SqlitePool) -> DbResult<UserPreferences> {
    #[derive(sqlx::FromRow)]
    struct PrefRow {
        user_id: String,
        default_instance_id: Option<String>,
        default_format: Format,
        queue_behavior: QueueBehavior,
        audio_only_default: bool,
        auto_download_wifi: bool,
        sponsorblock_enabled: bool,
        sponsorblock_categories: String,
        keyboard_shortcuts_enabled: bool,
        theme: Theme,
        cross_device_sync_enabled: bool,
        updated_at: DateTimeUtc,
    }

    let row = query_as!(
        PrefRow,
        r#"SELECT
            user_id,
            default_instance_id,
            default_format,
            queue_behavior,
            audio_only_default,
            auto_download_wifi,
            sponsorblock_enabled,
            sponsorblock_categories,
            keyboard_shortcuts_enabled,
            theme,
            cross_device_sync_enabled,
            updated_at
         FROM user_preferences WHERE user_id = 'current-user'"#
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Preferences not found".to_string())?;

    let categories: Vec<String> = serde_json::from_str(&row.sponsorblock_categories).unwrap_or_default();

    Ok(UserPreferences {
        user_id: row.user_id,
        default_instance_id: row.default_instance_id,
        default_format: row.default_format,
        queue_behavior: row.queue_behavior,
        audio_only_default: row.audio_only_default,
        auto_download_wifi: row.auto_download_wifi,
        sponsorblock_enabled: row.sponsorblock_enabled,
        sponsorblock_categories: categories,
        keyboard_shortcuts_enabled: row.keyboard_shortcuts_enabled,
        theme: row.theme,
        cross_device_sync_enabled: row.cross_device_sync_enabled,
        updated_at: row.updated_at,
    })
}

pub async fn update_preferences(pool: &SqlitePool, prefs: UserPreferences) -> DbResult<()> {
    let cats_json = serde_json::to_string(&prefs.sponsorblock_categories).unwrap_or_default();
    let default_format = prefs.default_format.to_string();
    let queue_behavior = prefs.queue_behavior.to_string();
    let audio_only_default = prefs.audio_only_default as i64;
    let auto_download_wifi = prefs.auto_download_wifi as i64;
    let sponsorblock_enabled = prefs.sponsorblock_enabled as i64;
    let keyboard_shortcuts_enabled = prefs.keyboard_shortcuts_enabled as i64;
    let theme = prefs.theme.to_string();
    let cross_device_sync_enabled = prefs.cross_device_sync_enabled as i64;
    let now = chrono::Utc::now().to_rfc3339();

    query!(
        "UPDATE user_preferences SET default_format = ?, queue_behavior = ?, audio_only_default = ?, auto_download_wifi = ?, sponsorblock_enabled = ?, sponsorblock_categories = ?, keyboard_shortcuts_enabled = ?, theme = ?, cross_device_sync_enabled = ?, updated_at = ? WHERE user_id = 'current-user'",
        default_format,
        queue_behavior,
        audio_only_default,
        auto_download_wifi,
        sponsorblock_enabled,
        cats_json,
        keyboard_shortcuts_enabled,
        theme,
        cross_device_sync_enabled,
        now
    ).execute(pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn get_playback_state(pool: &SqlitePool) -> DbResult<PlaybackState> {
    #[derive(sqlx::FromRow)]
    struct PlaybackStateRow {
        user_id: String,
        episode_id: Option<String>,
        position_seconds: f64,
        duration_seconds: Option<f64>,
        playback_rate: f64,
        volume: f64,
        is_audio_mode: i64,
        is_pip: i64,
        current_instance_id: Option<String>,
        last_updated: DateTimeUtc,
    }

    let row = query_as!(
        PlaybackStateRow,
        r#"SELECT
            user_id,
            episode_id,
            position_seconds,
            duration_seconds,
            playback_rate,
            volume,
            is_audio_mode,
            is_pip,
            current_instance_id,
            last_updated
         FROM playback_state WHERE user_id = 'current-user'"#
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "No playback state".to_string())?;

    Ok(PlaybackState {
        user_id: row.user_id,
        episode_id: row.episode_id,
        position_seconds: row.position_seconds,
        duration_seconds: row.duration_seconds,
        playback_rate: row.playback_rate,
        volume: row.volume,
        is_audio_mode: row.is_audio_mode != 0,
        is_pip: row.is_pip != 0,
        current_instance_id: row.current_instance_id,
        last_updated: row.last_updated,
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

    #[derive(sqlx::FromRow)]
    struct HistoryEntryRow {
        id: String,
        user_id: String,
        episode_id: String,
        position_seconds: f64,
        duration_seconds: Option<f64>,
        completed: i64,
        played_at: DateTimeUtc,
    }

    let rows = query_as!(
        HistoryEntryRow,
        "SELECT id, user_id, episode_id, position_seconds, duration_seconds, completed, played_at FROM history WHERE user_id = 'current-user' ORDER BY played_at DESC LIMIT $1 OFFSET $2",
        limit as i64, offset as i64
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|r| HistoryEntry {
        id: r.id,
        user_id: r.user_id,
        episode_id: r.episode_id,
        position_seconds: r.position_seconds,
        duration_seconds: r.duration_seconds,
        completed: r.completed != 0,
        played_at: r.played_at,
    }).collect())
}

pub async fn clear_history(pool: &SqlitePool) -> DbResult<()> {
    query!("DELETE FROM history WHERE user_id = 'current-user'").execute(pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn list_downloads(pool: &SqlitePool, status: Option<String>) -> DbResult<Vec<Download>> {
    #[derive(sqlx::FromRow)]
    struct DownloadRow {
        id: String,
        episode_id: String,
        quality: String,
        format: DownloadFormat,
        file_path: String,
        file_size: Option<i64>,
        status: DownloadStatus,
        progress: f64,
        error_message: Option<String>,
        created_at: String,
        completed_at: Option<String>,
    }

    if let Some(status) = status {
        let rows = query_as!(
            DownloadRow,
            r#"SELECT
                id,
                episode_id,
                quality,
                format,
                file_path,
                file_size,
                status,
                progress,
                error_message,
                created_at,
                completed_at
             FROM downloads WHERE status = ? ORDER BY created_at DESC"#,
            status
        )
        .fetch_all(pool).await.map_err(|e| e.to_string())?;

        Ok(rows.into_iter().map(|r| Download {
            id: r.id,
            episode_id: r.episode_id,
            quality: r.quality,
            format: r.format,
            file_path: r.file_path,
            file_size: r.file_size,
            status: r.status,
            progress: r.progress,
            error_message: r.error_message,
            created_at: r.created_at,
            completed_at: r.completed_at,
        }).collect())
    } else {
        let rows = query_as!(
            DownloadRow,
            r#"SELECT
                id,
                episode_id,
                quality,
                format,
                file_path,
                file_size,
                status,
                progress,
                error_message,
                created_at,
                completed_at
             FROM downloads ORDER BY created_at DESC"#
        )
        .fetch_all(pool).await.map_err(|e| e.to_string())?;

        Ok(rows.into_iter().map(|r| Download {
            id: r.id,
            episode_id: r.episode_id,
            quality: r.quality,
            format: r.format,
            file_path: r.file_path,
            file_size: r.file_size,
            status: r.status,
            progress: r.progress,
            error_message: r.error_message,
            created_at: r.created_at,
            completed_at: r.completed_at,
        }).collect())
    }
}

pub async fn list_shortcuts(pool: &SqlitePool) -> DbResult<Vec<KeyboardShortcut>> {
    #[derive(sqlx::FromRow)]
    struct KeyboardShortcutRow {
        id: String,
        user_id: String,
        action: String,
        key_combination: String,
        context: ShortcutContext,
        enabled: i64,
        is_custom: i64,
        created_at: DateTimeUtc,
        updated_at: DateTimeUtc,
    }

    let rows = query_as!(
        KeyboardShortcutRow,
        r#"SELECT
            id,
            user_id,
            action,
            key_combination,
            context,
            enabled,
            is_custom,
            created_at,
            updated_at
         FROM keyboard_shortcuts WHERE user_id = 'current-user'"#
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|r| KeyboardShortcut {
        id: r.id,
        user_id: r.user_id,
        action: r.action,
        key_combination: r.key_combination,
        context: r.context,
        enabled: r.enabled != 0,
        is_custom: r.is_custom != 0,
        created_at: r.created_at,
        updated_at: r.updated_at,
    }).collect())
}

pub async fn update_shortcut(pool: &SqlitePool, action: String, key: String, context: String) -> DbResult<()> {
    let now = chrono::Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();
    query!("INSERT OR REPLACE INTO keyboard_shortcuts (id, user_id, action, key_combination, context, enabled, is_custom, created_at, updated_at) VALUES (?, 'current-user', ?, ?, ?, 1, 0, ?, ?)",
        id, action, key, context, now, now
    ).execute(pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

// Matcher queries
pub async fn get_unmatched_podcasts(pool: &SqlitePool) -> DbResult<Vec<PodcastEpisode>> {
    // This would require a podcast_episodes table which doesn't exist in the schema
    // For now, return empty list - the podcast module has its own data structures
    Ok(Vec::new())
}

pub async fn get_youtube_videos(pool: &SqlitePool) -> DbResult<Vec<YoutubeVideo>> {
    // This would require a youtube_videos table which doesn't exist in the schema
    // For now, return empty list - the matcher uses extracted video data
    Ok(Vec::new())
}

pub async fn insert_episode_link(pool: &SqlitePool, link: &EpisodeLink) -> DbResult<()> {
    let matched_at = link.matched_at.to_rfc3339();
    let matched_by = link.matched_by.to_string();
    let created_at = link.created_at.to_rfc3339();
    let updated_at = link.updated_at.to_rfc3339();

    query!(
        r#"INSERT INTO episode_links (id, podcast_guid, youtube_video_id, confidence, matched_at, matched_by, title_similarity, date_diff_days, duration_diff_seconds, user_confirmed, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
        link.id,
        link.podcast_guid,
        link.youtube_video_id,
        link.confidence,
        matched_at,
        matched_by,
        link.title_similarity,
        link.date_diff_days,
        link.duration_diff_seconds,
        link.user_confirmed,
        created_at,
        updated_at,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}