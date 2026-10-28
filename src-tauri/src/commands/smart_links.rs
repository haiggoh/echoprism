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
use serde::Serialize;
use std::sync::Arc;
use tauri::{command, State};

/// The list response: the link plus BOTH sides' episode titles, resolved at
/// read time. Mirrors `ChannelWithHome` (commands/channels.rs:36) — the list
/// endpoint returns the entity plus the derived fields the UI needs, flattened
/// so the wire shape stays flat for the TS `EpisodeLink`.
///
/// Live-test Task 5: the panel printed `{podcast_guid} ↔ {youtube_video_id}`,
/// which the owner called "long id strings the user doesn't know how to judge".
/// Titles are hydrated, NOT stored — `episode_links` has no title columns, and
/// a renamed episode must show its new name here without a re-match.
#[derive(Serialize)]
pub struct EpisodeLinkWithTitles {
    #[serde(flatten)]
    pub link: EpisodeLink,
    /// `None` when no local episode carries this guid — the UI falls back to
    /// the raw id (monospace, muted) rather than inventing a title.
    pub podcast_title: Option<String>,
    pub video_title: Option<String>,
    pub podcast_channel: Option<String>,
    pub video_channel: Option<String>,
}

#[command]
pub async fn list_smart_links(
    db: State<'_,  Database>,
    confidence_min: Option<f64>,
) -> std::result::Result<Vec<EpisodeLinkWithTitles>, String> {
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
