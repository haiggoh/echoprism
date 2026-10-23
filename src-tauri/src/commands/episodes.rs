//! Episode/Video commands

use crate::db::Database;
use crate::instance_pool::InstancePool;
use crate::types::*;
use std::sync::Arc;
use tauri::{command, State};

#[command]
pub async fn get_feed(
    db: State<'_, Database>,
    params: Option<FeedParams>,
) -> std::result::Result<Vec<Episode>, String> {
    db.get_feed(params).await
}

#[derive(serde::Deserialize, Default)]
pub struct FeedParams {
    #[serde(rename = "type")]
    pub episode_type: Option<String>,
    /// Optional per-channel filter (2e): the Search screen lists one feed's
    /// episodes after a subscribe. Nested struct fields follow plain serde
    /// (Tauri camelCases only top-level args), so the rename is required for
    /// the frontend's `channelId` key.
    #[serde(rename = "channelId")]
    pub channel_id: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[command]
pub async fn get_episode(
    db: State<'_, Database>,
    episode_id: String,
) -> std::result::Result<Episode, String> {
    db.get_episode(&episode_id).await
}

#[command]
pub async fn search_episodes(
    db: State<'_, Database>,
    pool: State<'_, InstancePool>,
    extractor: State<'_, Arc<crate::extractor::Extractor>>,
    q: String,
    params: Option<SearchParams>,
) -> std::result::Result<Vec<Episode>, String> {
    let query = q.trim().to_string();
    if query.is_empty() {
        return Ok(Vec::new());
    }

    // Real sources first: instances in failover order, then the local
    // yt-dlp binary as the guaranteed fallback. Total failure degrades to
    // local-only results (the app stays usable offline).
    let candidates = crate::instance_pool::order_for_search(&pool.get_all().await);
    if candidates.is_empty() {
        // 2g: this branch used to be SILENT — the only seeded instance sat in
        // Failed (wrong probe) and every search went to yt-dlp with no trace.
        tracing::warn!(
            "Search '{}': no candidate instances (none seeded or all Failed) — going straight to yt-dlp",
            query
        );
    }
    let mut videos: Vec<crate::extractor::VideoInfo> = Vec::new();
    let mut source = String::from("none");
    for instance in &candidates {
        let attempt = tokio::time::timeout(
            std::time::Duration::from_secs(8),
            extractor.search_with_instance(&query, instance),
        )
        .await;
        match attempt {
            Ok(Ok(found)) if !found.is_empty() => {
                videos = found;
                source = instance.url.clone();
                break;
            }
            Ok(Ok(_)) => {
                // 2g: an empty answer used to `continue` silently — the other
                // unlogged branch of the silent yt-dlp fallback.
                tracing::info!("Search via {} answered with no hits", instance.url);
                continue; // answered with no hits — try the next source
            }
            Ok(Err(e)) => tracing::warn!("Search via {} failed: {}", instance.url, e),
            Err(_) => tracing::warn!("Search via {} timed out after 8s", instance.url),
        }
    }
    if videos.is_empty() {
        if !candidates.is_empty() {
            tracing::info!(
                "Search '{}': all {} candidate(s) exhausted — falling back to yt-dlp",
                query,
                candidates.len()
            );
        }
        match tokio::time::timeout(
            std::time::Duration::from_secs(45),
            extractor.search_with_yt_dlp(&query),
        )
        .await
        {
            Ok(Ok(found)) if !found.is_empty() => {
                videos = found;
                source = "yt-dlp".to_string();
            }
            Ok(Ok(_)) => {}
            Ok(Err(e)) => tracing::warn!("yt-dlp search failed: {}", e),
            Err(_) => tracing::warn!("yt-dlp search timed out"),
        }
    }

    search_episodes_resolved(&db, query, params, &videos, &source).await
}

/// The post-resolution tail of `search_episodes` (2f seam): store what the
/// source returned, then read the local results. Extracted so the
/// store-then-read policy is testable OFFLINE — a real failing store (the
/// migrations-only FK shape, rule 11) needs no network.
async fn search_episodes_resolved(
    db: &Database,
    query: String,
    params: Option<SearchParams>,
    videos: &[crate::extractor::VideoInfo],
    source: &str,
) -> std::result::Result<Vec<Episode>, String> {
    if !videos.is_empty() {
        // 2f: results came back from the source but could not be stored —
        // SURFACE the failure. The old WARN-and-continue turned the 2d FK bug
        // into a silent "no results" (the store error carried the diagnosis).
        let n = db.upsert_video_results(videos).await?;
        tracing::info!(
            "Search '{}' via {}: {} result(s), {} new",
            query,
            source,
            videos.len(),
            n
        );
    }

    // Local results (including anything just stored), smart links resolved.
    db.search_episodes(query, params).await
}

#[derive(serde::Deserialize, Default)]
pub struct SearchParams {
    #[serde(rename = "type")]
    /// Sent by SearchScreen's type filter (SearchScreen.tsx:21); wiring it
    /// into the FTS query is 1e's episode_type fix.
    pub episode_type: Option<String>,
    pub limit: Option<u32>,
}

/// The serde renames are the REAL invoke contract: Tauri camelCases only
/// top-level args, so inside `params` the frontend's `channelId` key must
/// match by serde. Nothing else exercises this path — the db test builds
/// FeedParams as a struct literal and the contract test only sees the
/// top-level `params` key — so a wrong rename would pass every gate while
/// the real shell silently lost the filter (2e adversarial triage).
#[test]
fn feed_params_deserializes_frontend_keys() {
    let params: FeedParams = serde_json::from_str(r#"{"channelId":"ch-1"}"#).expect("channelId");
    assert_eq!(params.channel_id.as_deref(), Some("ch-1"));
    let both: FeedParams =
        serde_json::from_str(r#"{"type":"podcast","channelId":"ch-2"}"#).expect("type+channelId");
    assert_eq!(both.episode_type.as_deref(), Some("podcast"));
    assert_eq!(both.channel_id.as_deref(), Some("ch-2"));
    // Absent keys stay None (no default-by-accident).
    let none: FeedParams = serde_json::from_str("{}").expect("empty");
    assert!(none.channel_id.is_none() && none.episode_type.is_none());
}

/// The stream resolver keys on the YouTube video id; search-upserted rows
/// carry it in video_id, everything else falls back to external_id.
fn video_id_for(episode: &Episode) -> String {
    episode
        .video_id
        .clone()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| episode.external_id.clone())
}

/// Assembly from a resolved stream: url and format come from the source —
/// no placeholder hosts.
fn stream_info_from(stream: crate::extractor::StreamUrl) -> StreamInfo {
    StreamInfo {
        url: stream.url,
        headers: stream.headers,
        format: stream.format,
    }
}

#[command]
pub async fn stream_episode(
    db: State<'_, Database>,
    pool: State<'_, InstancePool>,
    extractor: State<'_, Arc<crate::extractor::Extractor>>,
    episode_id: String,
    format: Option<String>,
    quality: Option<String>,
) -> std::result::Result<StreamInfo, String> {
    let episode = db.get_episode(&episode_id).await?;
    let video_id = video_id_for(&episode);
    let candidates = crate::instance_pool::order_for_search(&pool.get_all().await);
    let stream = extractor
        .resolve_stream(&video_id, format.as_deref(), quality.as_deref(), &candidates)
        .await?;
    Ok(stream_info_from(stream))
}

#[derive(serde::Serialize)]
pub struct StreamInfo {
    pub url: String,
    pub headers: Option<std::collections::HashMap<String, String>>,
    pub format: String,
}

#[cfg(test)]
mod search_store_tests {
    //! 2f: the store-then-read policy of search_episodes, offline-testable.
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    /// A pool in the recorded 2d incident state: migrations ran, but the
    /// `current-user` row is gone, so the batch upsert's channel insert hits
    /// the users FK and the whole transaction rolls back. The 2d FIX made the
    /// migrations create that row (see
    /// `search_results_store_on_a_migrations_only_database`), so the failure
    /// is injected explicitly — a fault fixture, not a setup skip.
    async fn incident_state_pool() -> sqlx::SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("connect in-memory sqlite");
        // sqlx turns FK enforcement on by default; explicit so the test
        // cannot silently lose it (same guard as the 2d test).
        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&pool)
            .await
            .expect("fk on");
        crate::db::migrations::run(&pool).await.expect("run migrations");
        sqlx::query("DELETE FROM users")
            .execute(&pool)
            .await
            .expect("inject the 2d incident state (no user row)");
        pool
    }

    fn synthetic_video(id: &str) -> crate::extractor::VideoInfo {
        crate::extractor::VideoInfo {
            id: id.into(),
            title: format!("video {id}"),
            description: None,
            duration: Some(60),
            thumbnail: None,
            channel: Some("Some Channel".into()),
            channel_id: None,
            upload_date: None,
            view_count: None,
            formats: Vec::new(),
        }
    }

    /// Results came back from the source but could not be stored → the error
    /// must SURFACE. The old behaviour (WARN + return the local read) turned
    /// this hard failure into a silent "no results" (the 2d incident).
    #[tokio::test]
    async fn store_failure_surfaces_instead_of_reading_back_empty() {
        let pool = incident_state_pool().await;
        let db = crate::db::Database::from_pool(pool);
        let err = search_episodes_resolved(
            &db,
            "vergecast".to_string(),
            None,
            &[synthetic_video("vid-1")],
            "test-source",
        )
        .await
        .expect_err("a store failure must surface, not read back as success");
        let lowered = err.to_lowercase();
        assert!(
            lowered.contains("foreign key") || err.contains("787"),
            "error should name the store failure, got: {err}"
        );
    }
}

#[cfg(test)]
mod stream_tests {
    use super::*;

    fn episode_stub() -> Episode {
        Episode {
            id: "ep-1".into(),
            channel_id: "ch-1".into(),
            external_id: "ext-1".into(),
            title: "t".into(),
            description: None,
            thumbnail_url: None,
            duration_seconds: None,
            published_at: None,
            url: None,
            video_id: None,
            podcast_guid: None,
            episode_number: None,
            season_number: None,
            audio_url: None,
            video_url: None,
            formats: None,
            chapters: None,
            sponsors: None,
            transcript_url: None,
            is_downloaded: false,
            download_quality: None,
            progress_seconds: 0.0,
            created_at: "2026-10-20T00:00:00Z".into(),
            updated_at: "2026-10-20T00:00:00Z".into(),
            smart_link_id: None,
            linked_episode_id: None,
        }
    }

    /// The stream resolver keys on the YouTube video id; episodes upserted
    /// from search carry it in video_id, other rows fall back to external_id.
    #[test]
    fn video_id_prefers_video_id_field_then_external_id() {
        let mut e = episode_stub();
        e.video_id = Some("z00Lhm3CqAM".into());
        e.external_id = "other-key".into();
        assert_eq!(video_id_for(&e), "z00Lhm3CqAM");

        e.video_id = None;
        assert_eq!(video_id_for(&e), "other-key");
    }

    /// StreamInfo assembly carries the resolved url/format — it must never
    /// invent a placeholder host (the old mock returned example.com).
    #[test]
    fn stream_info_assembly_maps_resolved_stream() {
        let resolved = crate::extractor::StreamUrl {
            url: "https://media.example/video.m3u8".into(),
            format: "hls".into(),
            quality: "720p".into(),
            headers: None,
        };
        let info = stream_info_from(resolved);
        assert_eq!(info.url, "https://media.example/video.m3u8");
        assert_eq!(info.format, "hls");
        assert!(info.headers.is_none());
    }
}