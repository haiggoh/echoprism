//! History commands

use crate::db::Database;
use crate::types::*;
use serde::Serialize;
use tauri::{command, State};

/// The list response: the entry plus the episode's title/thumbnail, so the
/// History screen shows WHAT was played (a raw uuid list is unusable — the
/// live-test finding behind the hydration).
#[derive(Serialize)]
pub struct HistoryEntryWithEpisode {
    #[serde(flatten)]
    pub entry: HistoryEntry,
    pub episode_title: Option<String>,
    pub episode_thumbnail: Option<String>,
}

/// Pure mapping (test target): entries + episode details → hydrated rows.
pub fn hydrate_history(
    entries: Vec<HistoryEntry>,
    details: &std::collections::HashMap<String, (String, Option<String>)>,
) -> Vec<HistoryEntryWithEpisode> {
    entries
        .into_iter()
        .map(|entry| {
            let (episode_title, episode_thumbnail) = match details.get(&entry.episode_id) {
                Some((title, thumb)) => (Some(title.clone()), thumb.clone()),
                None => (None, None),
            };
            HistoryEntryWithEpisode { entry, episode_title, episode_thumbnail }
        })
        .collect()
}

#[command]
pub async fn list_history(
    db: State<'_,  Database>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> std::result::Result<Vec<HistoryEntryWithEpisode>, String> {
    let entries = db.list_history(limit, offset).await?;
    let ids: Vec<String> = entries.iter().map(|e| e.episode_id.clone()).collect();
    let details = db.episode_details(&ids).await?;
    Ok(hydrate_history(entries, &details))
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

    /// The hydration mapping: entries + details → rows with titles, and an
    /// entry whose episode vanished (deleted) still renders, honestly
    /// without a title.
    #[test]
    fn hydrate_history_maps_details_and_survives_missing_episodes() {
        use super::*;

        let entry = HistoryEntry {
            id: "h1".into(),
            user_id: "current-user".into(),
            episode_id: "ep-1".into(),
            position_seconds: 12.0,
            duration_seconds: None,
            completed: false,
            played_at: chrono::Utc::now().into(),
        };
        let gone = HistoryEntry { episode_id: "ep-deleted".into(), ..entry.clone() };
        let mut details = std::collections::HashMap::new();
        details.insert("ep-1".to_string(), ("A played video".to_string(), Some("https://img.example/1.jpg".to_string())));

        let rows = hydrate_history(vec![entry, gone], &details);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].episode_title.as_deref(), Some("A played video"));
        assert_eq!(rows[0].episode_thumbnail.as_deref(), Some("https://img.example/1.jpg"));
        assert_eq!(rows[1].episode_title, None, "a deleted episode renders untitled, not broken");
    }

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

        // The hydration path resolves the title for the recorded row.
        let details = crate::db::queries::episode_details(&pool, &[episode_id.clone()])
            .await
            .expect("details");
        assert_eq!(details.get(&episode_id).map(|(t, _)| t.as_str()), Some("A played video"));
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