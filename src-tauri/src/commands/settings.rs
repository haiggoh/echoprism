//! Settings commands

use crate::db::Database;
use crate::types::*;
use tauri::{command, State};

#[command]
pub async fn get_settings(db: State<'_,  Database>) -> std::result::Result<UserPreferences, String> {
    db.get_preferences().await
}

#[command]
pub async fn update_settings(
    db: State<'_,  Database>,
    prefs: UserPreferences,
) -> std::result::Result<(), String> {
    db.update_preferences(prefs).await
}