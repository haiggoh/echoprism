//! Smart Episode Linking commands

use crate::db::Database;
use crate::types::*;
use tauri::{command, State};

#[command]
pub async fn list_smart_links(
    db: State<'_,  Database>,
    confidence_min: Option<f64>,
) -> std::result::Result<Vec<EpisodeLink>, String> {
    db.list_episode_links(confidence_min).await
}

#[command]
pub async fn match_episodes(db: State<'_,  Database>) -> std::result::Result<MatchResult, String> {
    // Trigger background matching
    Ok(MatchResult { matched_count: 0 })
}

#[derive(serde::Serialize)]
pub struct MatchResult {
    pub matched_count: u32,
}

#[command]
pub async fn confirm_smart_link(
    db: State<'_,  Database>,
    link_id: String,
    confirmed: bool,
) -> std::result::Result<(), String> {
    // Confirm or reject a smart link
    Ok(())
}

#[command]
pub async fn unlink_smart_link(db: State<'_,  Database>, link_id: String) -> std::result::Result<(), String> {
    // Remove a smart link
    Ok(())
}