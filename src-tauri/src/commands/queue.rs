//! Queue management commands

use crate::db::Database;
use crate::types::*;
use tauri::{command, State};

#[command]
pub async fn get_queue(db: State<'_, Database>) -> std::result::Result<Queue, String> {
    db.get_queue().await
}

#[command]
pub async fn add_to_queue(
    db: State<'_, Database>,
    episode_id: String,
    mode: Option<PlayMode>,
    position: Option<usize>,
) -> std::result::Result<QueueItem, String> {
    db.add_to_queue(episode_id, mode, position).await
}

#[command]
pub async fn reorder_queue(db: State<'_, Database>, from: usize, to: usize) -> std::result::Result<(), String> {
    db.reorder_queue(from, to).await
}

#[command]
pub async fn remove_queue_item(db: State<'_, Database>, item_id: String) -> std::result::Result<(), String> {
    db.remove_from_queue(&item_id).await
}

#[command]
pub async fn clear_queue(db: State<'_, Database>) -> std::result::Result<(), String> {
    db.clear_queue().await
}

#[command]
pub async fn play_next_queue(db: State<'_, Database>, episode_id: String) -> std::result::Result<(), String> {
    db.play_next(episode_id).await
}