//! History commands

use crate::db::Database;
use crate::types::*;
use tauri::{command, State};

#[command]
pub async fn list_history(
    db: State<'_,  Database>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> std::result::Result<Vec<HistoryEntry>, String> {
    db.list_history(limit, offset).await
}

#[command]
pub async fn clear_history(db: State<'_,  Database>) -> std::result::Result<(), String> {
    db.clear_history().await
}