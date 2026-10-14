//! Episode/Video commands

use crate::db::Database;
use crate::types::*;
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
    pub filter: Option<String>,
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
    q: String,
    params: Option<SearchParams>,
) -> std::result::Result<Vec<Episode>, String> {
    db.search_episodes(q, params).await
}

#[derive(serde::Deserialize, Default)]
pub struct SearchParams {
    #[serde(rename = "type")]
    pub episode_type: Option<String>,
    pub filters: Option<std::collections::HashMap<String, String>>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[command]
pub async fn stream_episode(
    db: State<'_, Database>,
    episode_id: String,
    format: Option<String>,
    _quality: Option<String>,
) -> std::result::Result<StreamInfo, String> {
    // Get episode from DB
    let _episode = db.get_episode(&episode_id).await?;

    // Get stream URL from extractor
    // For now, return mock data
    Ok(StreamInfo {
        url: format!("https://example.com/stream/{}", episode_id),
        headers: None,
        format: format.unwrap_or_else(|| "hls".to_string()),
    })
}

#[command]
pub async fn smart_link_switch_episode(
    _db: State<'_, Database>,
    _link_id: String,
) -> std::result::Result<(), String> {
    // Switch playback via smart link
    Ok(())
}

#[derive(serde::Serialize)]
pub struct StreamInfo {
    pub url: String,
    pub headers: Option<std::collections::HashMap<String, String>>,
    pub format: String,
}