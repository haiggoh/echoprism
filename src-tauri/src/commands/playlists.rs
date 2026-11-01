//! Playlist commands (dead-controls plan Phase 4: "Save as playlist" stores
//! the live queue under a name; playlists can be replayed).
//!
//! The queue itself is client-side Zustand state, so `play_playlist` returns
//! the playlist's episodes IN ORDER and the TS layer fills the queue and
//! starts playback — the Rust side owns persistence, the client owns playback.

use crate::db::Database;
use crate::types::*;
use serde::Serialize;
use tauri::{command, State};

/// A playlist item with its episode's title hydrated at read time (mirrors
/// EpisodeLinkWithTitles: titles are not stored on the item, so a renamed
/// episode shows its new name without a re-save).
#[derive(Serialize)]
pub struct PlaylistItemWithTitle {
    #[serde(flatten)]
    pub item: PlaylistItem,
    pub episode_title: Option<String>,
}

#[command]
pub async fn list_playlists(db: State<'_, Database>) -> std::result::Result<Vec<Playlist>, String> {
    db.list_playlists().await
}

#[command]
pub async fn create_playlist(
    db: State<'_, Database>,
    name: String,
) -> std::result::Result<Playlist, String> {
    db.create_playlist(&name).await
}

#[command]
pub async fn rename_playlist(
    db: State<'_, Database>,
    playlist_id: String,
    name: String,
) -> std::result::Result<(), String> {
    db.rename_playlist(&playlist_id, &name).await
}

#[command]
pub async fn delete_playlist(
    db: State<'_, Database>,
    playlist_id: String,
) -> std::result::Result<(), String> {
    db.delete_playlist(&playlist_id).await
}

#[command]
pub async fn list_playlist_items(
    db: State<'_, Database>,
    playlist_id: String,
) -> std::result::Result<Vec<PlaylistItemWithTitle>, String> {
    let rows = db.list_playlist_items(&playlist_id).await?;
    Ok(rows
        .into_iter()
        .map(|r| PlaylistItemWithTitle {
            item: PlaylistItem {
                id: r.id,
                playlist_id: r.playlist_id,
                episode_id: r.episode_id,
                position: r.position,
                added_at: r.added_at,
            },
            episode_title: r.episode_title,
        })
        .collect())
}

#[command]
pub async fn add_episode_to_playlist(
    db: State<'_, Database>,
    playlist_id: String,
    episode_id: String,
) -> std::result::Result<PlaylistItem, String> {
    db.add_episode_to_playlist(&playlist_id, &episode_id).await
}

#[command]
pub async fn remove_playlist_item(
    db: State<'_, Database>,
    item_id: String,
) -> std::result::Result<(), String> {
    db.remove_playlist_item(&item_id).await
}

#[command]
pub async fn save_queue_as_playlist(
    db: State<'_, Database>,
    name: String,
    episode_ids: Vec<String>,
) -> std::result::Result<Playlist, String> {
    db.save_queue_as_playlist(&name, &episode_ids).await
}

#[command]
pub async fn play_playlist(
    db: State<'_, Database>,
    playlist_id: String,
) -> std::result::Result<Vec<Episode>, String> {
    let ids = db.playlist_episode_ids(&playlist_id).await?;
    let mut episodes = Vec::with_capacity(ids.len());
    for id in ids {
        episodes.push(db.get_episode(&id).await?);
    }
    Ok(episodes)
}
