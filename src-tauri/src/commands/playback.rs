//! Playback control commands

use crate::db::Database;
use crate::types::*;
use tauri::{command, State};

#[command]
pub async fn state(db: State<'_, Database>) -> std::result::Result<PlaybackState, String> {
    db.get_playback_state().await
}

#[command]
pub async fn update(
    db: State<'_, Database>,
    params: PlaybackUpdateParams,
) -> std::result::Result<(), String> {
    db.update_playback_state(params).await
}

#[derive(serde::Deserialize)]
pub struct PlaybackUpdateParams {
    pub position: Option<f64>,
    pub rate: Option<f64>,
    pub volume: Option<f64>,
    pub audio_mode: Option<bool>,
}

#[command]
pub async fn toggle_audio(
    db: State<'_, Database>,
    episode_id: String,
) -> std::result::Result<(), String> {
    // Toggle audio/video mode for current episode
    Ok(())
}

#[command]
pub async fn smart_link(
    db: State<'_, Database>,
    link_id: String,
) -> std::result::Result<(), String> {
    // Switch format via smart link with position sync
    Ok(())
}