//! Keyboard shortcuts commands

use crate::db::Database;
use crate::types::*;
use tauri::{command, State};

#[command]
pub async fn list_shortcuts(db: State<'_,  Database>) -> std::result::Result<Vec<KeyboardShortcut>, String> {
    db.list_shortcuts().await
}

#[command]
pub async fn update_shortcut_cmd(
    db: State<'_,  Database>,
    action: String,
    key: String,
    context: String,
) -> std::result::Result<(), String> {
    db.update_shortcut(action, key, context).await
}