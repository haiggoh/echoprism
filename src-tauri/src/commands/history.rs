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

/// Live-test finding: history existed as a READ surface only — nothing in
/// the app ever WROTE a row, so "History" could only ever show seed data.
/// The player records one entry per actual playback start (resolution
/// succeeded), covering every source: card clicks, queue auto-advance,
/// next/previous.
#[command]
pub async fn record_history(
    db: State<'_,  Database>,
    episode_id: String,
) -> std::result::Result<HistoryEntry, String> {
    db.record_history_entry(&episode_id).await
}

#[cfg(test)]
mod history_tests {
    use sqlx::sqlite::SqlitePoolOptions;

    /// Live-test finding: history had NO writer — the surface could only
    /// show seed data. The recording path is proven against the production
    /// seed path (rule 11): the episode exists because upsert_video_results
    /// created it, the user row because the 2d migrations create it.
    #[tokio::test]
    async fn record_history_persists_one_row_per_play() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("connect");
        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&pool)
            .await
            .expect("fk on");
        crate::db::migrations::run(&pool).await.expect("migrations");

        let video = crate::extractor::VideoInfo {
            id: "histVid1".into(),
            title: "A played video".into(),
            description: None,
            duration: Some(60),
            thumbnail: None,
            channel: Some("The Verge".into()),
            channel_id: Some("UCddiUEpeqJcYeBxX1IVBKvQ".into()),
            upload_date: None,
            view_count: None,
            formats: Vec::new(),
        };
        crate::db::queries::upsert_video_results(&pool, &[video])
            .await
            .expect("seed through the production path");

        // The player records episode.ID (a generated uuid), not the
        // external video id — fetch the real row id.
        let episode_id: String =
            sqlx::query_scalar("SELECT id FROM episodes WHERE external_id = 'histVid1'")
                .fetch_one(&pool)
                .await
                .expect("seeded episode id");

        let entry = crate::db::queries::record_history_entry(&pool, &episode_id)
            .await
            .expect("record");
        assert_eq!(entry.episode_id, episode_id);

        let listed = crate::db::queries::list_history(&pool, None, None)
            .await
            .expect("list");
        assert_eq!(listed.len(), 1, "exactly the play that happened");
        assert_eq!(listed[0].episode_id, episode_id);
    }

    /// An unknown episode must FAIL (FK), not write an orphan row.
    #[tokio::test]
    async fn record_history_rejects_unknown_episodes() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("connect");
        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&pool)
            .await
            .expect("fk on");
        crate::db::migrations::run(&pool).await.expect("migrations");
        let result = crate::db::queries::record_history_entry(&pool, "no-such-episode").await;
        assert!(result.is_err(), "FK must hold: {result:?}");
    }
}