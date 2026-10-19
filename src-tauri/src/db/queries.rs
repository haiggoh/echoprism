//! Database queries

use crate::types::*;
use sqlx::{SqlitePool, query_as, query};
use std::str::FromStr;

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

/// Instances a fresh install can search through. Only endpoints whose search
/// API was verified live make the default cut; the public Invidious fleet has
/// disabled its API ecosystem-wide (official registry api:false, verified
/// 2026-10-20), so no Invidious instances are seeded.
pub const DEFAULT_INSTANCES: [&str; 1] = ["https://pipedapi.ducks.party"];

/// Insert the default search instances, but only into an empty table — a user
/// who already configured instances keeps exactly what they configured.
/// Returns how many rows were inserted.
pub async fn seed_default_instances_if_empty(pool: &SqlitePool) -> DbResult<usize> {
    let existing = list_instances(pool).await?;
    if !existing.is_empty() {
        return Ok(0);
    }
    let now = chrono::Utc::now().to_rfc3339();
    let mut seeded = 0usize;
    for url in DEFAULT_INSTANCES {
        let host = url.split("//").nth(1).unwrap_or(url);
        let slug = host.replace(['.', '-'], "-");
        let instance = Instance {
            id: format!("default-{}", slug),
            url: url.to_string(),
            instance_type: InstanceType::Piped,
            health: InstanceHealth::Unknown,
            latency_ms: None,
            last_checked: None,
            auto_failover: true,
            supports_sabr: false,
            supports_age_restricted: false,
            region: None,
            country: None,
            pinned: false,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        insert_instance(pool, &instance).await?;
        seeded += 1;
    }
    Ok(seeded)
}

/// Store network search results locally so the established search path —
/// FTS + smart links — finds them. `external_id` carries the YouTube video id
/// and is the stable key: existing rows are never touched (user state on them
/// survives). Channels are found or created by their YouTube channel id when
/// known, else a deterministic key derived from the channel name. Returns how
/// many episodes were newly inserted.
pub async fn upsert_video_results(
    pool: &SqlitePool,
    videos: &[crate::extractor::VideoInfo],
) -> DbResult<usize> {
    let mut inserted = 0usize;
    for video in videos {
        if video.id.is_empty() || video.title.is_empty() {
            continue;
        }
        let channel_external = video
            .channel_id
            .clone()
            .filter(|c| !c.trim().is_empty())
            .unwrap_or_else(|| {
                format!(
                    "yt-name:{}",
                    video
                        .channel
                        .as_deref()
                        .unwrap_or("unknown")
                        .trim()
                        .to_lowercase()
                )
            });
        let channel_title = video
            .channel
            .clone()
            .filter(|c| !c.trim().is_empty())
            .unwrap_or_else(|| "Unknown channel".to_string());

        let channel_row: Option<String> = sqlx::query_scalar(
            "SELECT id FROM channels WHERE external_id = ? LIMIT 1",
        )
        .bind(&channel_external)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;

        let channel_row = match channel_row {
            Some(id) => id,
            None => {
                // Search-discovered channels are not subscriptions; the user
                // can subscribe from the UI later.
                sqlx::query(
                    "INSERT INTO channels (user_id, external_id, title, is_subscribed, notifications_enabled, type) \
                     VALUES ('current-user', ?, ?, 0, 0, 'video')",
                )
                .bind(&channel_external)
                .bind(&channel_title)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
                sqlx::query_scalar("SELECT id FROM channels WHERE external_id = ? LIMIT 1")
                    .bind(&channel_external)
                    .fetch_optional(pool)
                    .await
                    .map_err(|e| e.to_string())?
                    .ok_or_else(|| "channel row vanished after insert".to_string())?
            }
        };

        let exists: Option<String> = sqlx::query_scalar(
            "SELECT id FROM episodes WHERE external_id = ? LIMIT 1",
        )
        .bind(&video.id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;
        if exists.is_some() {
            continue;
        }

        // published_at stays NULL for relative dates ("1 hour ago") — mixing
        // them with the ISO timestamps the feed sorts by would corrupt the
        // ordering.
        sqlx::query(
            "INSERT INTO episodes (channel_id, external_id, title, description, thumbnail_url, duration_seconds, url, video_id) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&channel_row)
        .bind(&video.id)
        .bind(&video.title)
        .bind(&video.description)
        .bind(&video.thumbnail)
        .bind(video.duration.map(|d| d as i64))
        .bind(format!("https://www.youtube.com/watch?v={}", video.id))
        .bind(&video.id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
        inserted += 1;
    }
    Ok(inserted)
}

pub async fn insert_instance(pool: &SqlitePool, instance: &Instance) -> DbResult<()> {
    let instance_type_str = instance.instance_type.to_string();
    let health_str = instance.health.to_string();
    let auto_failover = instance.auto_failover as i64;
    let supports_sabr = instance.supports_sabr as i64;
    let supports_age_restricted = instance.supports_age_restricted as i64;
    let pinned = instance.pinned as i64;
    let latency_ms = instance.latency_ms;
    let last_checked = instance.last_checked.as_deref();
    let region = instance.region.as_deref();
    let country = instance.country.as_deref();
    let created_at = instance.created_at.clone();
    let updated_at = instance.updated_at.clone();
    query!(
        r#"INSERT INTO instances (id, url, type, health, latency_ms, last_checked,
              auto_failover, supports_sabr, supports_age_restricted, region, country,
              pinned, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
        instance.id,
        instance.url,
        instance_type_str,
        health_str,
        latency_ms,
        last_checked,
        auto_failover,
        supports_sabr,
        supports_age_restricted,
        region,
        country,
        pinned,
        created_at,
        updated_at,
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
                id,
                user_id,
                external_id,
                title,
                handle,
                thumbnail_url,
                description,
                subscriber_count,
                is_subscribed,
                subscribed_at,
                notifications_enabled,
                format_preference,
                instance_id,
                type as "channel_type: _",
                podcast_feed_url,
                podcast_guid,
                last_fetched_at,
                created_at,
                updated_at
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
                id,
                user_id,
                external_id,
                title,
                handle,
                thumbnail_url,
                description,
                subscriber_count,
                is_subscribed,
                subscribed_at,
                notifications_enabled,
                format_preference,
                instance_id,
                type as "channel_type: _",
                podcast_feed_url,
                podcast_guid,
                last_fetched_at,
                created_at,
                updated_at
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
    let is_subscribed = channel.is_subscribed as i64;
    let notifications_enabled = channel.notifications_enabled as i64;
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
        is_subscribed,
        channel.subscribed_at,
        notifications_enabled,
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
    let offset = params.as_ref().and_then(|p| p.offset).unwrap_or(0);

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
        is_downloaded: i64,
        download_quality: Option<String>,
        progress_seconds: f64,
        created_at: String,
        updated_at: String,
    }

    if let Some(et) = ep_type {
        let limit_i64 = limit as i64;
        let offset_i64 = offset as i64;
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
            limit_i64,
            offset_i64
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
            is_downloaded: r.is_downloaded != 0,
            download_quality: r.download_quality,
            progress_seconds: r.progress_seconds,
            created_at: r.created_at,
            updated_at: r.updated_at,
            smart_link_id: None,
            linked_episode_id: None,
        }).collect())
    } else {
        let limit_i64 = limit as i64;
        let offset_i64 = offset as i64;
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
            limit_i64,
            offset_i64
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
            is_downloaded: r.is_downloaded != 0,
            download_quality: r.download_quality,
            progress_seconds: r.progress_seconds,
            created_at: r.created_at,
            updated_at: r.updated_at,
            smart_link_id: None,
            linked_episode_id: None,
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
        is_downloaded: i64,
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
        is_downloaded: row.is_downloaded != 0,
        download_quality: row.download_quality,
        progress_seconds: row.progress_seconds,
        created_at: row.created_at,
        updated_at: row.updated_at,
        smart_link_id: None,
        linked_episode_id: None,
    })
}

pub async fn search_episodes(
    pool: &SqlitePool,
    query_str: String,
    params: Option<crate::commands::episodes::SearchParams>,
) -> DbResult<Vec<Episode>> {
    let limit = params.as_ref().and_then(|p| p.limit).unwrap_or(50);
    let limit_i64 = limit as i64;

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
        is_downloaded: i64,
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
        limit_i64
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
        is_downloaded: r.is_downloaded != 0,
        download_quality: r.download_quality,
        progress_seconds: r.progress_seconds,
        created_at: r.created_at,
        updated_at: r.updated_at,
        smart_link_id: None,
        linked_episode_id: None,
    }).collect())
}

pub async fn get_queue(pool: &SqlitePool) -> DbResult<Queue> {
    #[derive(sqlx::FromRow)]
    struct QueueRow {
        id: String,
        user_id: String,
        current_index: i64,
        repeat_mode: RepeatMode,
        shuffle: i64,
        audio_only_mode: i64,
        created_at: String,
        updated_at: String,
    }

    let queue_row = sqlx::query_as!(
        QueueRow,
        r#"SELECT
            id,
            user_id,
            current_index,
            repeat_mode,
            shuffle,
            audio_only_mode,
            created_at,
            updated_at
         FROM queues WHERE user_id = 'current-user' LIMIT 1"#
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    match queue_row {
        Some(queue_row) => {
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

            let items = sqlx::query_as!(
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
                queue_row.id
            )
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?;

            Ok(Queue {
                id: queue_row.id,
                user_id: queue_row.user_id,
                current_index: queue_row.current_index,
                repeat_mode: queue_row.repeat_mode,
                shuffle: queue_row.shuffle != 0,
                audio_only_mode: queue_row.audio_only_mode != 0,
                created_at: queue_row.created_at,
                updated_at: queue_row.updated_at,
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
    },
    None => {
        let now = chrono::Utc::now().to_rfc3339();
        let now2 = now.clone();
        let now3 = now2.clone();
        let queue = Queue {
            id: uuid::Uuid::new_v4().to_string(),
            user_id: "current-user".to_string(),
            current_index: 0,
            repeat_mode: RepeatMode::Off,
            shuffle: false,
            audio_only_mode: false,
            created_at: now.clone(),
            updated_at: now2,
            items: vec![],
        };
        let repeat_mode = queue.repeat_mode as RepeatMode;
        let shuffle = queue.shuffle as i64;
        let audio_only = queue.audio_only_mode as i64;
        let created = now;
        let updated = now3;
        query!(
            "INSERT INTO queues (id, user_id, current_index, repeat_mode, shuffle, audio_only_mode, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            queue.id, queue.user_id, queue.current_index, repeat_mode,
            shuffle, audio_only, created, updated
        ).execute(pool).await.map_err(|e| e.to_string())?;
        Ok(queue)
    }
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
        user_confirmed: i64,
        created_at: DateTimeUtc,
        updated_at: DateTimeUtc,
    }

    let rows = sqlx::query_as!(
        EpisodeLinkRow,
        r#"SELECT
            id,
            podcast_guid,
            youtube_video_id,
            confidence,
            matched_at,
            matched_by as "matched_by: _",
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
        user_confirmed: r.user_confirmed != 0,
        created_at: r.created_at,
        updated_at: r.updated_at,
    }).collect())
}

pub async fn get_preferences(pool: &SqlitePool) -> DbResult<UserPreferences> {
    let row = query!(
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
            card_click_action,
            updated_at
         FROM user_preferences WHERE user_id = 'current-user'"#
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Preferences not found".to_string())?;

    let categories: Vec<String> = serde_json::from_str(&row.sponsorblock_categories).unwrap_or_default();

    Ok(UserPreferences {
        user_id: row.user_id.expect("user_id is not null"),
        default_instance_id: row.default_instance_id,
        default_format: Format::from_str(&row.default_format).unwrap_or(Format::Unified),
        queue_behavior: QueueBehavior::from_str(&row.queue_behavior).unwrap_or(QueueBehavior::PlayNext),
        audio_only_default: row.audio_only_default != 0,
        auto_download_wifi: row.auto_download_wifi != 0,
        sponsorblock_enabled: row.sponsorblock_enabled != 0,
        sponsorblock_categories: categories,
        keyboard_shortcuts_enabled: row.keyboard_shortcuts_enabled != 0,
        theme: Theme::from_str(&row.theme).unwrap_or(Theme::System),
        cross_device_sync_enabled: row.cross_device_sync_enabled != 0,
        card_click_action: CardClickAction::from_str(&row.card_click_action).unwrap_or(CardClickAction::Auto),
        updated_at: DateTimeUtc::from(row.updated_at),
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
    let card_click_action = prefs.card_click_action.to_string();
    let now = chrono::Utc::now().to_rfc3339();

    query!(
        "UPDATE user_preferences SET default_format = ?, queue_behavior = ?, audio_only_default = ?, auto_download_wifi = ?, sponsorblock_enabled = ?, sponsorblock_categories = ?, keyboard_shortcuts_enabled = ?, theme = ?, cross_device_sync_enabled = ?, card_click_action = ?, updated_at = ? WHERE user_id = 'current-user'",
        default_format,
        queue_behavior,
        audio_only_default,
        auto_download_wifi,
        sponsorblock_enabled,
        cats_json,
        keyboard_shortcuts_enabled,
        theme,
        cross_device_sync_enabled,
        card_click_action,
        now
    ).execute(pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn get_playback_state(pool: &SqlitePool) -> DbResult<PlaybackState> {
    let row = query!(
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
        user_id: row.user_id.expect("user_id is not null"),
        episode_id: row.episode_id,
        position_seconds: row.position_seconds,
        duration_seconds: row.duration_seconds,
        playback_rate: row.playback_rate,
        volume: row.volume,
        is_audio_mode: row.is_audio_mode != 0,
        is_pip: row.is_pip != 0,
        current_instance_id: row.current_instance_id,
        last_updated: DateTimeUtc::from(row.last_updated),
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

    let limit_i64 = limit as i64;
    let offset_i64 = offset as i64;
    let rows = query_as!(
        HistoryEntryRow,
        "SELECT id, user_id, episode_id, position_seconds, duration_seconds, completed, played_at FROM history WHERE user_id = 'current-user' ORDER BY played_at DESC LIMIT ? OFFSET ?",
        limit_i64, offset_i64
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
        context: String,
        enabled: i64,
        is_custom: i64,
        created_at: String,
        updated_at: String,
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
        context: ShortcutContext::from_str(&r.context).unwrap_or(ShortcutContext::Global),
        enabled: r.enabled != 0,
        is_custom: r.is_custom != 0,
        created_at: DateTimeUtc::from(r.created_at),
        updated_at: DateTimeUtc::from(r.updated_at),
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
pub async fn get_unmatched_podcasts(_pool: &SqlitePool) -> DbResult<Vec<PodcastEpisode>> {
    // This would require a podcast_episodes table which doesn't exist in the schema
    // For now, return empty list - the podcast module has its own data structures
    Ok(Vec::new())
}

pub async fn get_youtube_videos(_pool: &SqlitePool) -> DbResult<Vec<YoutubeVideo>> {
    // This would require a youtube_videos table which doesn't exist in the schema
    // For now, return empty list - the matcher uses extracted video data
    Ok(Vec::new())
}

pub async fn insert_episode_link(pool: &SqlitePool, link: &EpisodeLink) -> DbResult<()> {
    let matched_at = link.matched_at.to_rfc3339();
    let matched_by = link.matched_by.to_string();
    let created_at = link.created_at.to_rfc3339();
    let updated_at = link.updated_at.to_rfc3339();
    let user_confirmed = link.user_confirmed as i64;

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
        user_confirmed,
        created_at,
        updated_at,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// D6 (design-decisions.md): resolve smart links for a batch of episodes at
/// READ time, setting `smart_link_id` (the pairing link) and
/// `linked_episode_id` (the cross-stream twin) so any episode the user picks
/// is already linked — the backend half of "detection happens while
/// searching". Batched over the whole result set: two runtime queries, no
/// per-episode lookups. Uses runtime-checked queries (QueryBuilder /
/// query_as::<_, T>), deliberately NOT `query_as!` macros — new or changed
/// macro SQL would demand regenerating the .sqlx offline cache (plan
/// adversarial note), which runtime queries avoid entirely.
pub async fn resolve_smart_links(pool: &SqlitePool, episodes: &mut [Episode]) -> DbResult<()> {
    let guids: Vec<&str> = episodes
        .iter()
        .filter_map(|e| e.podcast_guid.as_deref())
        .collect();
    let vids: Vec<&str> = episodes
        .iter()
        .filter_map(|e| e.video_id.as_deref())
        .collect();
    if guids.is_empty() && vids.is_empty() {
        return Ok(());
    }

    #[derive(sqlx::FromRow)]
    struct LinkRow {
        id: String,
        podcast_guid: String,
        youtube_video_id: String,
    }

    // Links touching any stream key of the batch. Mirror of the mock layer's
    // withChannelAndLinks (src/mocks/router.ts) so both worlds behave alike.
    let mut qb = sqlx::QueryBuilder::new(
        "SELECT id, podcast_guid, youtube_video_id FROM episode_links WHERE ",
    );
    let mut first = true;
    for (column, keys) in [("podcast_guid", &guids), ("youtube_video_id", &vids)] {
        if keys.is_empty() {
            continue;
        }
        if !first {
            qb.push(" OR ");
        }
        qb.push(column);
        qb.push(" IN (");
        for (i, key) in keys.iter().enumerate() {
            if i > 0 {
                qb.push(", ");
            }
            qb.push_bind(key);
        }
        qb.push(")");
        first = false;
    }
    let links = qb
        .build_query_as::<LinkRow>()
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    if links.is_empty() {
        return Ok(());
    }

    // The twins: episodes on the opposite stream of every matched link. A
    // twin may lie outside the current result set (searching one family of a
    // two-stream show must still surface the other family's episode id).
    let link_vids: Vec<&str> = links.iter().map(|l| l.youtube_video_id.as_str()).collect();
    let link_guids: Vec<&str> = links.iter().map(|l| l.podcast_guid.as_str()).collect();

    #[derive(sqlx::FromRow)]
    struct TwinRow {
        id: String,
        video_id: Option<String>,
        podcast_guid: Option<String>,
    }
    let mut tq = sqlx::QueryBuilder::new("SELECT id, video_id, podcast_guid FROM episodes WHERE ");
    let mut t_first = true;
    for (column, keys) in [("video_id", &link_vids), ("podcast_guid", &link_guids)] {
        if keys.is_empty() {
            continue;
        }
        if !t_first {
            tq.push(" OR ");
        }
        tq.push(column);
        tq.push(" IN (");
        for (i, key) in keys.iter().enumerate() {
            if i > 0 {
                tq.push(", ");
            }
            tq.push_bind(key);
        }
        tq.push(")");
        t_first = false;
    }
    let twins = tq
        .build_query_as::<TwinRow>()
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    let video_to_ep: std::collections::HashMap<&str, &str> = twins
        .iter()
        .filter_map(|t| t.video_id.as_deref().map(|v| (v, t.id.as_str())))
        .collect();
    let guid_to_ep: std::collections::HashMap<&str, &str> = twins
        .iter()
        .filter_map(|t| t.podcast_guid.as_deref().map(|g| (g, t.id.as_str())))
        .collect();

    for ep in episodes.iter_mut() {
        let link = links.iter().find(|l| {
            ep.podcast_guid.as_deref() == Some(l.podcast_guid.as_str())
                || ep.video_id.as_deref() == Some(l.youtube_video_id.as_str())
        });
        if let Some(link) = link {
            let self_id = ep.id.clone();
            ep.smart_link_id = Some(link.id.clone());
            // A podcast-side episode's twin is the link's YouTube video; a
            // video-side episode's twin is the link's podcast guid (same
            // precedence as the mock).
            let twin = if ep.podcast_guid.is_some() {
                video_to_ep.get(link.youtube_video_id.as_str())
            } else {
                guid_to_ep.get(link.podcast_guid.as_str())
            };
            // A twin is the OTHER stream's episode: a link that resolves back
            // to the episode itself (possible only for rows carrying both
            // keys — the schema permits them, today's ingestion never writes
            // one) is not a twin.
            ep.linked_episode_id = twin
                .filter(|t| **t != self_id)
                .map(|t| t.to_string());
        }
    }
    Ok(())
}

// ============================
// PLAY MODE RULES (D7)
// ============================
// Runtime-checked queries on purpose (see resolve_smart_links): new macro
// queries would require regenerating the .sqlx offline cache.

#[derive(sqlx::FromRow)]
struct PlayModeRuleRow {
    id: String,
    channel_id: String,
    title_pattern: String,
    play_mode: String,
    priority: i64,
    created_at: String,
    updated_at: String,
}

impl PlayModeRuleRow {
    fn into_rule(self) -> DbResult<PlayModeRule> {
        let play_mode: PlayMode = self
            .play_mode
            .parse()
            .map_err(|_| format!("invalid play_mode '{}' in play_mode_rules", self.play_mode))?;
        Ok(PlayModeRule {
            id: self.id,
            channel_id: self.channel_id,
            title_pattern: self.title_pattern,
            play_mode,
            priority: self.priority,
            created_at: self.created_at,
            updated_at: self.updated_at,
        })
    }
}

pub async fn list_play_mode_rules(
    pool: &SqlitePool,
    channel_id: Option<String>,
) -> DbResult<Vec<PlayModeRule>> {
    // Evaluation order (design-decisions D7): priority DESC, then oldest
    // first — deterministic, first match wins downstream. rowid breaks
    // created_at ties: datetime('now') has 1-second resolution, so rules
    // created in the same second would otherwise order by SQLite's
    // unspecified tie behavior. rowid = insertion order and survives
    // upserts (DO UPDATE keeps the original row).
    let rows = if let Some(channel_id) = channel_id {
        query_as::<_, PlayModeRuleRow>(
            "SELECT id, channel_id, title_pattern, play_mode, priority, created_at, updated_at \
             FROM play_mode_rules WHERE channel_id = ? \
             ORDER BY priority DESC, created_at ASC, rowid ASC",
        )
        .bind(channel_id)
        .fetch_all(pool)
        .await
    } else {
        query_as::<_, PlayModeRuleRow>(
            "SELECT id, channel_id, title_pattern, play_mode, priority, created_at, updated_at \
             FROM play_mode_rules \
             ORDER BY priority DESC, created_at ASC, rowid ASC",
        )
        .fetch_all(pool)
        .await
    }
    .map_err(|e| e.to_string())?;

    rows.into_iter().map(|r| r.into_rule()).collect()
}

pub async fn set_play_mode_rule(
    pool: &SqlitePool,
    channel_id: String,
    title_pattern: String,
    play_mode: PlayMode,
    priority: Option<i64>,
) -> DbResult<PlayModeRule> {
    // 'unified' is not a valid rule mode (a no-op override); the schema CHECK
    // enforces this too, but failing here gives a readable error.
    if !matches!(play_mode, PlayMode::Video | PlayMode::Audio) {
        return Err(format!(
            "play_mode must be 'video' or 'audio', got '{}'",
            play_mode
        ));
    }
    // Upsert on (channel_id, title_pattern): same channel+pattern REPLACES
    // (mode + priority), never duplicates.
    let priority = priority.unwrap_or(0);
    let row = query_as::<_, PlayModeRuleRow>(
        "INSERT INTO play_mode_rules (channel_id, title_pattern, play_mode, priority) \
         VALUES (?, ?, ?, ?) \
         ON CONFLICT(channel_id, title_pattern) DO UPDATE SET \
           play_mode = excluded.play_mode, priority = excluded.priority, \
           updated_at = datetime('now') \
         RETURNING id, channel_id, title_pattern, play_mode, priority, created_at, updated_at",
    )
    .bind(&channel_id)
    .bind(&title_pattern)
    .bind(play_mode.to_string())
    .bind(priority)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    row.into_rule()
}

pub async fn remove_play_mode_rule(pool: &SqlitePool, rule_id: &str) -> DbResult<()> {
    // Idempotent: deleting an unknown id is not an error (matches the mock).
    query("DELETE FROM play_mode_rules WHERE id = ?")
        .bind(rule_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod d6_d7_tests {
    //! Real-backend tests for D6 link resolution and D7 play-mode rules.
    //! Runs migrations (the same include_str! SQL the app executes at
    //! startup) against a fresh in-memory SQLite pool, seeds fixtures, and
    //! exercises the query layer directly — no Tauri harness needed.
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    /// One connection only: each `:memory:` connection gets its OWN private
    /// database, so a pool >1 would split schema and data across connections.
    async fn fresh_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("connect in-memory sqlite");
        crate::db::migrations::run(&pool).await.expect("run migrations");
        // The backend assumes a single local user; every channel row FKs to it
        // (same as scripts/seed.sql's first statement).
        query("INSERT OR IGNORE INTO users (id) VALUES ('current-user')")
            .execute(&pool)
            .await
            .expect("insert user");
        pool
    }

    async fn insert_channel(
        pool: &SqlitePool,
        id: &str,
        external_id: &str,
        title: &str,
        ctype: &str,
        feed_url: Option<&str>,
    ) {
        query(
            "INSERT OR IGNORE INTO channels \
             (id, user_id, external_id, title, is_subscribed, notifications_enabled, type, podcast_feed_url) \
             VALUES (?, 'current-user', ?, ?, 1, 0, ?, ?)",
        )
        .bind(id)
        .bind(external_id)
        .bind(title)
        .bind(ctype)
        .bind(feed_url)
        .execute(pool)
        .await
        .expect("insert channel");
    }

    async fn insert_episode(
        pool: &SqlitePool,
        id: &str,
        channel_id: &str,
        external_id: &str,
        title: &str,
        video_id: Option<&str>,
        podcast_guid: Option<&str>,
    ) {
        query(
            "INSERT OR IGNORE INTO episodes \
             (id, channel_id, external_id, title, video_id, podcast_guid, is_downloaded, progress_seconds) \
             VALUES (?, ?, ?, ?, ?, ?, 0, 0)",
        )
        .bind(id)
        .bind(channel_id)
        .bind(external_id)
        .bind(title)
        .bind(video_id)
        .bind(podcast_guid)
        .execute(pool)
        .await
        .expect("insert episode");
    }

    async fn insert_link(pool: &SqlitePool, id: &str, guid: &str, vid: &str) {
        query("INSERT OR IGNORE INTO episode_links (id, podcast_guid, youtube_video_id, confidence, matched_by) VALUES (?, ?, ?, 0.95, 'auto')")
            .bind(id)
            .bind(guid)
            .bind(vid)
            .execute(pool)
            .await
            .expect("insert link");
    }

    /// The D6/D7 canonical two-stream show (owner example): YouTube-native
    /// 'Some More News…' titles on ch-3, podcast-native 'Even More News…'
    /// titles on ch-4, every story present on both streams and linked.
    async fn seed_two_stream_show(pool: &SqlitePool) {
        insert_channel(pool, "ch-3", "UC-mock-smn", "Some More News", "video", None).await;
        insert_channel(
            pool,
            "ch-4",
            "https://feeds.example.org/emn.xml",
            "Even More News",
            "podcast",
            Some("https://feeds.example.org/emn.xml"),
        )
        .await;
        insert_episode(pool, "ep-smn-1", "ch-3", "smn-vid-001", "Some More News: Why Billionaires Should Not Exist", Some("smn-vid-001"), None).await;
        insert_episode(pool, "ep-smn-2", "ch-3", "smn-vid-002", "Some More News: The Housing Crisis Is Not an Accident", Some("smn-vid-002"), None).await;
        insert_episode(pool, "ep-emn-1", "ch-4", "emn-guid-001", "Even More News: Why Billionaires Should Not Exist", None, Some("emn-guid-001")).await;
        insert_episode(pool, "ep-emn-2", "ch-4", "emn-guid-002", "Even More News: The Housing Crisis Is Not an Accident", None, Some("emn-guid-002")).await;
        insert_link(pool, "link-2", "emn-guid-001", "smn-vid-001").await;
        insert_link(pool, "link-3", "emn-guid-002", "smn-vid-002").await;
    }

    #[tokio::test]
    async fn search_resolves_smart_links_and_twins() {
        let pool = fresh_pool().await;
        seed_two_stream_show(&pool).await;

        let mut results = search_episodes(
            &pool,
            "more news".to_string(),
            None,
        )
        .await
        .expect("search");
        assert_eq!(results.len(), 4, "both families must match 'more news'");
        resolve_smart_links(&pool, &mut results)
            .await
            .expect("resolve");

        let smn = results.iter().find(|e| e.id == "ep-smn-1").expect("smn-1");
        assert_eq!(smn.smart_link_id.as_deref(), Some("link-2"));
        assert_eq!(smn.linked_episode_id.as_deref(), Some("ep-emn-1"));

        let emn = results.iter().find(|e| e.id == "ep-emn-2").expect("emn-2");
        assert_eq!(emn.smart_link_id.as_deref(), Some("link-3"));
        assert_eq!(emn.linked_episode_id.as_deref(), Some("ep-smn-2"));
    }

    #[tokio::test]
    async fn unlinked_episodes_carry_no_link_fields() {
        let pool = fresh_pool().await;
        seed_two_stream_show(&pool).await;
        insert_episode(&pool, "ep-solo", "ch-3", "solo-vid", "Some More News: A Solo Story", Some("solo-vid"), None).await;

        let mut results = search_episodes(&pool, "solo".to_string(), None)
            .await
            .expect("search");
        resolve_smart_links(&pool, &mut results).await.expect("resolve");
        assert_eq!(results.len(), 1);
        assert!(results[0].smart_link_id.is_none());
        assert!(results[0].linked_episode_id.is_none());
    }

    #[tokio::test]
    async fn twin_resolves_outside_the_result_set() {
        // Searching only the podcast family must still surface the video
        // twin's id — D6's "match any episode the user chooses".
        let pool = fresh_pool().await;
        seed_two_stream_show(&pool).await;

        let mut results = search_episodes(&pool, "housing".to_string(), None)
            .await
            .expect("search");
        assert_eq!(results.len(), 2);
        resolve_smart_links(&pool, &mut results).await.expect("resolve");
        let emn = results.iter().find(|e| e.id == "ep-emn-2").expect("emn-2");
        assert_eq!(emn.linked_episode_id.as_deref(), Some("ep-smn-2"));
    }

    #[tokio::test]
    async fn play_mode_rules_crud_roundtrip_and_upsert() {
        let pool = fresh_pool().await;
        seed_two_stream_show(&pool).await;

        // Create
        let rule = set_play_mode_rule(
            &pool,
            "ch-3".into(),
            "Some More News".into(),
            PlayMode::Video,
            None,
        )
        .await
        .expect("set rule");
        assert_eq!(rule.play_mode, PlayMode::Video);
        assert_eq!(rule.priority, 0);

        // Upsert: same (channel, pattern) replaces, never duplicates
        let updated = set_play_mode_rule(
            &pool,
            "ch-3".into(),
            "Some More News".into(),
            PlayMode::Audio,
            Some(5),
        )
        .await
        .expect("upsert rule");
        assert_eq!(updated.id, rule.id, "upsert must return the same row");
        assert_eq!(updated.play_mode, PlayMode::Audio);

        let all = list_play_mode_rules(&pool, None).await.expect("list");
        assert_eq!(all.len(), 1, "upsert must not duplicate");
        assert_eq!(all[0].priority, 5);

        // Channel filter
        let filtered = list_play_mode_rules(&pool, Some("ch-4".into()))
            .await
            .expect("list filtered");
        assert!(filtered.is_empty());

        // Remove is idempotent
        remove_play_mode_rule(&pool, &updated.id).await.expect("remove");
        remove_play_mode_rule(&pool, &updated.id)
            .await
            .expect("remove again (idempotent)");
        let empty = list_play_mode_rules(&pool, None).await.expect("list");
        assert!(empty.is_empty());
    }

    #[tokio::test]
    async fn unified_is_not_a_valid_rule_mode() {
        let pool = fresh_pool().await;
        seed_two_stream_show(&pool).await;
        let err = set_play_mode_rule(
            &pool,
            "ch-3".into(),
            "Some More News".into(),
            PlayMode::Unified,
            None,
        )
        .await
        .expect_err("'unified' must be rejected");
        assert!(err.contains("video") || err.contains("audio"), "readable error, got: {err}");
    }

    // The D7 chain's second step reads channel.format_preference, and real
    // shell rows carry the SCHEMA DEFAULT 'both' (scripts/seed.sql inserts
    // channels without the column; the CHECK constraint's domain is
    // video/audio/both). Before Format::Both existed, decode of one 'both'
    // row failed the whole list_channels query — silently disabling the
    // channel-default step.
    #[tokio::test]
    async fn channel_with_schema_default_format_preference_lists() {
        let pool = fresh_pool().await;
        // The helper omits format_preference on purpose: the row gets 'both'.
        insert_channel(&pool, "ch-both", "UC-both", "Both Pref Channel", "video", None).await;
        let channels = list_channels(&pool, None).await.expect("list channels");
        let ch = channels
            .iter()
            .find(|c| c.id == "ch-both")
            .expect("seeded channel present");
        assert!(
            matches!(ch.format_preference, Format::Both),
            "schema default 'both' must decode, got {:?}",
            ch.format_preference
        );
    }

    // Finding 7 (adversarial review): the TS `Channel` interface reads `type`,
    // so the JSON wire name must be `type`, not the Rust field name
    // `channel_type` — otherwise every real-shell channel renders a blank
    // type badge while the fixture-backed jsdom tests all pass. sqlx reads
    // the DB column by FIELD name, so the serde rename must not leak there;
    // this test guards both directions of that contract.
    #[test]
    fn channel_serializes_type_field_for_the_ts_contract() {
        let ch = Channel {
            id: "ch-x".into(),
            user_id: "current-user".into(),
            external_id: "UC-x".into(),
            title: "Wire Contract".into(),
            handle: None,
            thumbnail_url: None,
            description: None,
            subscriber_count: None,
            is_subscribed: true,
            subscribed_at: "2026-10-19T00:00:00Z".into(),
            notifications_enabled: false,
            format_preference: Format::Both,
            instance_id: None,
            channel_type: ChannelType::Video,
            podcast_feed_url: None,
            podcast_guid: None,
            last_fetched_at: None,
            created_at: "2026-10-19T00:00:00Z".into(),
            updated_at: "2026-10-19T00:00:00Z".into(),
        };
        let json = serde_json::to_value(&ch).expect("serialize channel");
        assert!(json.get("type").is_some(), "wire key must be 'type'");
        assert!(
            json.get("channel_type").is_none(),
            "Rust field name must not leak to the wire"
        );
    }
}

#[cfg(test)]
mod search_source_tests {
    //! Instance seeding for search sources: defaults land only when the
    //! table is empty, never duplicating user rows. Same in-memory backend as
    //! d6_d7_tests (real migrations, no Tauri harness).
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn fresh_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("connect in-memory sqlite");
        crate::db::migrations::run(&pool).await.expect("run migrations");
        query("INSERT OR IGNORE INTO users (id) VALUES ('current-user')")
            .execute(&pool)
            .await
            .expect("insert user");
        pool
    }

    fn user_instance(id: &str, url: &str, ctype: InstanceType) -> Instance {
        Instance {
            id: id.to_string(),
            url: url.to_string(),
            instance_type: ctype,
            health: InstanceHealth::Unknown,
            latency_ms: None,
            last_checked: None,
            auto_failover: true,
            supports_sabr: false,
            supports_age_restricted: false,
            region: None,
            country: None,
            pinned: false,
            created_at: "2026-10-20T00:00:00Z".to_string(),
            updated_at: "2026-10-20T00:00:00Z".to_string(),
        }
    }

    #[tokio::test]
    async fn seeds_default_instances_only_when_table_is_empty() {
        let pool = fresh_pool().await;

        let seeded = seed_default_instances_if_empty(&pool).await.expect("seed");
        assert_eq!(seeded, 1, "exactly the one API-verified default instance");

        let again = seed_default_instances_if_empty(&pool).await.expect("re-seed");
        assert_eq!(again, 0, "second run must not duplicate");

        let all = list_instances(&pool).await.expect("list");
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].instance_type, InstanceType::Piped);
        assert_eq!(all[0].url, "https://pipedapi.ducks.party");
        assert!(all[0].auto_failover);
    }

    #[tokio::test]
    async fn never_touches_a_table_that_already_has_instances() {
        let pool = fresh_pool().await;
        insert_instance(&pool, &user_instance("user-1", "https://my.local.instance", InstanceType::Invidious))
            .await
            .expect("insert user instance");

        let seeded = seed_default_instances_if_empty(&pool).await.expect("seed no-op");
        assert_eq!(seeded, 0, "user instances present - no defaults injected");

        let all = list_instances(&pool).await.expect("list");
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].id, "user-1");
    }

    fn video(id: &str, title: &str, channel: &str, channel_id: Option<&str>, duration: u64) -> crate::extractor::VideoInfo {
        crate::extractor::VideoInfo {
            id: id.to_string(),
            title: title.to_string(),
            description: Some(format!("Description of {}", title)),
            duration: Some(duration),
            thumbnail: Some(format!("https://img.example/{}.jpg", id)),
            channel: Some(channel.to_string()),
            channel_id: channel_id.map(|c| c.to_string()),
            upload_date: None,
            view_count: Some(1000),
            formats: Vec::new(),
        }
    }

    /// Network search results must land in the local FTS index (so the
    /// existing search — with smart links — finds them), be idempotent on the
    /// video id, and never clobber user state on rows that already exist.
    #[tokio::test]
    async fn upserted_search_results_are_fts_searchable_and_idempotent() {
        let pool = fresh_pool().await;

        let videos = vec![
            video("z00Lhm3CqAM", "Apple's HomeView has an app problem | The Vergecast", "The Verge", Some("UCddiUEpeqJcYeBxX1IVBKvQ"), 5912),
            video("CBVODIUnPwc", "Why your favorite creator is building an app | The Vergecast", "The Verge", Some("UCddiUEpeqJcYeBxX1IVBKvQ"), 2487),
        ];
        let inserted = upsert_video_results(&pool, &videos).await.expect("first upsert");
        assert_eq!(inserted, 2);

        // Both episodes surface through the same FTS search the UI calls.
        let found = search_episodes(&pool, "vergecast".to_string(), None).await.expect("search");
        assert_eq!(found.len(), 2, "both upserted episodes are searchable");
        assert!(found.iter().all(|e| e.video_id.as_deref().is_some()));
        assert!(found.iter().all(|e| e.external_id == e.video_id.clone().unwrap_or_default()));

        // One channel row serves both videos (same YouTube channel id).
        let channels: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM channels")
            .fetch_one(&pool).await.expect("count channels");
        assert_eq!(channels, 1, "both videos share one channel row");
        let subscribed: i64 = sqlx::query_scalar("SELECT is_subscribed FROM channels LIMIT 1")
            .fetch_one(&pool).await.expect("read flag");
        assert_eq!(subscribed, 0, "search-discovered channels must not auto-subscribe");

        // Idempotent: a re-upsert adds nothing.
        let again = upsert_video_results(&pool, &videos).await.expect("second upsert");
        assert_eq!(again, 0, "re-upserting the same videos inserts nothing");

        // Non-clobbering: a user-mutated row survives a re-upsert.
        query("UPDATE episodes SET title = 'user-renamed' WHERE external_id = 'z00Lhm3CqAM'")
            .execute(&pool).await.expect("mutate title");
        upsert_video_results(&pool, &videos).await.expect("third upsert");
        let title: String = sqlx::query_scalar("SELECT title FROM episodes WHERE external_id = 'z00Lhm3CqAM'")
            .fetch_one(&pool).await.expect("read title");
        assert_eq!(title, "user-renamed", "upsert must never clobber existing rows");
    }

    #[tokio::test]
    async fn upsert_creates_channel_from_name_when_channel_id_missing() {
        let pool = fresh_pool().await;
        let videos = vec![
            video("aqz-KE-bpKQ", "Fixture video two: another weekly news episode", "Power User", None, 2487),
        ];
        let inserted = upsert_video_results(&pool, &videos).await.expect("upsert");
        assert_eq!(inserted, 1);

        let found = search_episodes(&pool, "fixture".to_string(), None).await.expect("search");
        assert_eq!(found.len(), 1, "episode linked to the name-derived channel");
        let channel_external: String = sqlx::query_scalar(
            "SELECT c.external_id FROM episodes e JOIN channels c ON c.id = e.channel_id LIMIT 1")
            .fetch_one(&pool).await.expect("read channel");
        assert!(channel_external.starts_with("yt-name:"), "fallback key is deterministic");
    }
}
