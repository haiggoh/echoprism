//! Download commands

use crate::db::Database;
use crate::types::*;
use tauri::{command, State};

#[command]
pub async fn start_download(
    db: State<'_,  Database>,
    episode_id: String,
    quality: String,
    format: DownloadFormat,
) -> std::result::Result<Download, String> {
    let now = chrono::Utc::now().to_rfc3339();
    // Start download via yt-dlp
    Ok(Download {
        id: uuid::Uuid::new_v4().to_string(),
        episode_id,
        quality,
        format,
        file_path: String::new(),
        file_size: None,
        status: DownloadStatus::Pending,
        progress: 0.0,
        error_message: None,
        created_at: now,
        completed_at: None,
    })
}

#[command]
pub async fn list_downloads(
    db: State<'_,  Database>,
    status: Option<String>,
) -> std::result::Result<Vec<Download>, String> {
    db.list_downloads(status).await
}

#[command]
pub async fn cancel_download(db: State<'_,  Database>, id: String) -> std::result::Result<(), String> {
    Ok(())
}

#[command]
pub async fn delete_download(db: State<'_,  Database>, id: String) -> std::result::Result<(), String> {
    Ok(())
}