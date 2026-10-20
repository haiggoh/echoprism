//! Smart Episode Linking commands
//!
//! 1d Phase 3: match_episodes/confirm_smart_link/unlink_smart_link were
//! no-op stubs returning hardcoded values; all three now delegate to the
//! real matcher / query layer. `match_episodes` runs the SAME matcher the
//! hourly background loop uses (accessed through app state, the pattern in
//! background_tasks::start_all).

use crate::db::Database;
use crate::matcher::EpisodeMatcher;
use crate::types::*;
use std::sync::Arc;
use tauri::{command, State};

#[command]
pub async fn list_smart_links(
    db: State<'_,  Database>,
    confidence_min: Option<f64>,
) -> std::result::Result<Vec<EpisodeLink>, String> {
    db.list_episode_links(confidence_min).await
}

/// Run the matcher now. Returns the shared core MatchResult — its
/// serialization key `matched_count` is the TS contract
/// (src/hooks/useTauriCommands.ts:73), pinned by
/// `match_result_serializes_matched_count_for_the_ts_contract`.
#[command]
pub async fn match_episodes(
    matcher: State<'_, Arc<EpisodeMatcher>>,
) -> std::result::Result<MatchResult, String> {
    matcher.match_all().await
}

#[command]
pub async fn confirm_smart_link(
    db: State<'_,  Database>,
    link_id: String,
    confirmed: bool,
) -> std::result::Result<(), String> {
    db.set_episode_link_confirmation(&link_id, confirmed).await
}

#[command]
pub async fn unlink_smart_link(db: State<'_,  Database>, link_id: String) -> std::result::Result<(), String> {
    db.delete_episode_link(&link_id).await
}
