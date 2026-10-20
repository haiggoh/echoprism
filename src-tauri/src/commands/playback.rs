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