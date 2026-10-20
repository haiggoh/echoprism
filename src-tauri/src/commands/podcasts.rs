//! Podcast directory search, subscription and refresh commands

use crate::db::Database;
use crate::podcast::PodcastSearchResult;
use std::sync::Arc;
use tauri::{command, State};

/// Search the iTunes podcast directory (no key required). Each result's
/// feed_url is the subscribe target.
#[command]
pub async fn search_podcasts(
    podcast: State<'_, Arc<crate::podcast::PodcastManager>>,
    term: String,
) -> std::result::Result<Vec<PodcastSearchResult>, String> {
    podcast.search_itunes(&term).await
}

#[derive(serde::Serialize)]
pub struct SubscribedPodcast {
    pub channel_id: String,
    pub title: String,
    pub new_episodes: usize,
}

/// Subscribe to a podcast by feed URL: fetch, parse, and persist channel +
/// feed + episodes in one transaction. Re-running with the same URL refreshes
/// (new episodes are added, stored ones are never touched).
#[command]
pub async fn subscribe_podcast(
    db: State<'_, Database>,
    podcast: State<'_, Arc<crate::podcast::PodcastManager>>,
    feed_url: String,
    title: Option<String>,
) -> std::result::Result<SubscribedPodcast, String> {
    let feed_url = feed_url.trim().to_string();
    if feed_url.is_empty() {
        return Err("feed URL required".to_string());
    }
    let feed_data = podcast.fetch_feed(&feed_url).await?;
    let fallback_title = title
        .filter(|t| !t.trim().is_empty())
        .unwrap_or_else(|| feed_data.title.clone());
    let (channel_id, inserted) = db
        .upsert_podcast_subscription(&feed_url, &fallback_title, &feed_data)
        .await?;
    tracing::info!(
        "Subscribed to '{}': {} new episode(s)",
        feed_data.title,
        inserted
    );
    Ok(SubscribedPodcast {
        channel_id,
        title: feed_data.title,
        new_episodes: inserted,
    })
}

/// Refresh every podcast feed that is due (manual trigger; the background
/// task runs the same logic on a 30-minute cadence). Returns how many feeds
/// were refreshed.
#[command]
pub async fn refresh_podcasts(
    podcast: State<'_, Arc<crate::podcast::PodcastManager>>,
) -> std::result::Result<usize, String> {
    podcast.refresh_due_feeds().await
}
