//! Play-mode rule commands (D7: per-title-family default play modes)
//!
//! A rule maps (channel, title-pattern) → 'video' | 'audio' so one channel
//! with two title families can default differently per family (owner case:
//! 'Some More News…' → video, 'Even More News…' → audio). See
//! design-decisions.md D7 for the full rule chain these commands feed.

use crate::db::Database;
use crate::types::*;
use tauri::{command, State};

#[command]
pub async fn list_play_mode_rules(
    db: State<'_, Database>,
    channel_id: Option<String>,
) -> std::result::Result<Vec<PlayModeRule>, String> {
    db.list_play_mode_rules(channel_id).await
}

#[command]
pub async fn set_play_mode_rule(
    db: State<'_, Database>,
    channel_id: String,
    title_pattern: String,
    play_mode: String,
    priority: Option<i64>,
) -> std::result::Result<PlayModeRule, String> {
    // Parse + reject 'unified' here so the error is readable at the IPC
    // boundary, before the typed layer or the schema CHECK.
    let mode: PlayMode = play_mode
        .parse()
        .map_err(|_| format!("play_mode must be 'video' or 'audio', got '{}'", play_mode))?;
    db.set_play_mode_rule(channel_id, title_pattern, mode, priority).await
}

#[command]
pub async fn remove_play_mode_rule(
    db: State<'_, Database>,
    rule_id: String,
) -> std::result::Result<(), String> {
    db.remove_play_mode_rule(&rule_id).await
}
