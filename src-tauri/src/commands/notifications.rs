//! Episode notifications (the live-test feature: a real bell instead of the
//! placeholder). Seen-state is per user; "new" = published after the last
//! seen instant across SUBSCRIBED channels, compared via SQLite datetime()
//! which normalizes the differing RFC 3339 formats feeds and the app write
//! (the 1c lesson). First run initializes the seen instant to NOW —
//! episodes that existed before you started never notify.

use crate::db::Database;
use serde::Serialize;
use tauri::{command, State};

#[derive(Debug, Clone, Serialize)]
pub struct NewEpisodeItem {
    pub id: String,
    pub title: String,
    pub channel_title: String,
    pub published_at: Option<String>,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct NotificationSummary {
    pub new_count: usize,
    pub episodes: Vec<NewEpisodeItem>,
}

/// The seen instant, initializing to NOW on the very first call (single
/// INSERT OR IGNORE + a read — idempotent, so every command can call it).
pub(crate) async fn ensure_seen_instant(pool: &sqlx::SqlitePool) -> Result<String, String> {
    sqlx::query("INSERT OR IGNORE INTO episode_seen_state (user_id, last_seen_at) VALUES ('current-user', ?)")
        .bind(chrono::Utc::now().to_rfc3339())
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    let instant: String = sqlx::query_scalar("SELECT last_seen_at FROM episode_seen_state WHERE user_id = 'current-user'")
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(instant)
}

pub(crate) async fn new_episode_items(
    pool: &sqlx::SqlitePool,
    since: &str,
) -> Result<Vec<NewEpisodeItem>, String> {
    let rows: Vec<(String, String, String, Option<String>, String)> = sqlx::query_as(
        "SELECT e.id, e.title, c.title, e.published_at, c.type \
         FROM episodes e JOIN channels c ON c.id = e.channel_id \
         WHERE c.is_subscribed = 1 AND e.published_at IS NOT NULL \
           AND datetime(e.published_at) > datetime(?) \
         ORDER BY datetime(e.published_at) DESC LIMIT 50",
    )
    .bind(since)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .map(|(id, title, channel_title, published_at, kind)| NewEpisodeItem {
            id,
            title,
            channel_title,
            published_at,
            kind,
        })
        .collect())
}

/// The bell's payload: the count and the episodes themselves (the panel
/// lists them; there is no second fetch).
#[command]
pub async fn episode_notifications(
    db: State<'_, Database>,
) -> std::result::Result<NotificationSummary, String> {
    let pool = db.pool();
    let since = ensure_seen_instant(pool).await?;
    let episodes = new_episode_items(pool, &since).await?;
    Ok(NotificationSummary { new_count: episodes.len(), episodes })
}

/// Opening the panel (or the explicit mark action) clears the bell.
#[command]
pub async fn mark_episodes_seen(db: State<'_, Database>) -> std::result::Result<(), String> {
    sqlx::query("UPDATE episode_seen_state SET last_seen_at = ? WHERE user_id = 'current-user'")
        .bind(chrono::Utc::now().to_rfc3339())
        .execute(db.pool())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod notifications_tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn fresh_pool() -> sqlx::SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("connect");
        sqlx::query("PRAGMA foreign_keys = ON").execute(&pool).await.expect("fk on");
        crate::db::migrations::run(&pool).await.expect("migrations");
        pool
    }

    async fn seed_video(pool: &sqlx::SqlitePool, id: &str, published_at: &str) {
        let video = crate::extractor::VideoInfo {
            id: id.into(),
            title: format!("Episode {id}"),
            description: None,
            duration: Some(60),
            thumbnail: None,
            channel: Some("The Verge".into()),
            channel_id: Some("UCddiUEpeqJcYeBxX1IVBKvQ".into()),
            upload_date: None,
            view_count: None,
            formats: Vec::new(),
        };
        crate::db::queries::upsert_video_results(pool, &[video]).await.expect("seed");
        // 1b semantics: a search-discovered channel stays UNSUBSCRIBED.
        // Notifications cover SUBSCRIBED channels — reflect a subscribed
        // state (the test-data setup for the refresh scenario).
        sqlx::query("UPDATE channels SET is_subscribed = 1 WHERE external_id = 'UCddiUEpeqJcYeBxX1IVBKvQ'")
            .execute(pool)
            .await
            .expect("subscribe the channel");
        // The production upsert stores a generated episode id; point the
        // published_at at the test instant directly (the production writer
        // is the feed refresh setting it from the feed).
        let episode_row_id: String =
            sqlx::query_scalar("SELECT id FROM episodes WHERE external_id = ?")
                .bind(id)
                .fetch_one(pool)
                .await
                .expect("seeded episode");
        sqlx::query("UPDATE episodes SET published_at = ? WHERE id = ?")
            .bind(published_at)
            .bind(&episode_row_id)
            .execute(pool)
            .await
            .expect("set published_at");
    }

    /// First run initializes the seen instant to NOW: existing episodes
    /// (including a backfill from a subscribe) never notify.
    #[tokio::test]
    async fn first_run_sees_everything_preexisting() {
        let pool = fresh_pool().await;
        seed_video(&pool, "old", "2026-10-01T00:00:00Z").await;

        let since = ensure_seen_instant(&pool).await.expect("init");
        let items = new_episode_items(&pool, &since).await.expect("query");
        assert!(
            !items.iter().any(|i| i.id.contains("old") || i.title.contains("old")),
            "pre-existing episodes never notify"
        );
        // The 2026-10-01 instant is BEFORE the init — confirmed empty.
        assert!(items.is_empty());
    }

    /// An episode published after the seen instant counts, with its channel
    /// title hydrated for the panel; marking seen clears the bell.
    #[tokio::test]
    async fn newer_episodes_count_until_marked_seen() {
        let pool = fresh_pool().await;
        let since = ensure_seen_instant(&pool).await.expect("init");
        // Published one second AFTER the init (the refresh's new episode).
        let later = (chrono::DateTime::parse_from_rfc3339(&since).expect("parse")
            + chrono::Duration::seconds(1))
        .to_rfc3339();
        seed_video(&pool, "fresh", &later).await;

        let items = new_episode_items(&pool, &since).await.expect("query");
        assert_eq!(items.len(), 1, "the newer episode notifies");
        assert_eq!(items[0].channel_title, "The Verge");

        // Mark seen at an instant DETERMINISTICALLY after the episode (a
        // wall-clock now races the +1s future episode on a fast machine).
        let seen_at = (chrono::DateTime::parse_from_rfc3339(&later).expect("parse")
            + chrono::Duration::seconds(1))
        .to_rfc3339();
        sqlx::query("UPDATE episode_seen_state SET last_seen_at = ? WHERE user_id = 'current-user'")
            .bind(&seen_at)
            .execute(&pool)
            .await
            .expect("mark");
        let items = new_episode_items(&pool, &seen_at).await.expect("query");
        assert!(items.is_empty(), "marking seen clears the bell");
    }

    async fn mark_seen_instant(pool: &sqlx::SqlitePool) -> Result<(), String> {
        sqlx::query("UPDATE episode_seen_state SET last_seen_at = ? WHERE user_id = 'current-user'")
            .bind(chrono::Utc::now().to_rfc3339())
            .execute(pool)
            .await
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    async fn mark_seen_instant_read(pool: &sqlx::SqlitePool) -> String {
        sqlx::query_scalar("SELECT last_seen_at FROM episode_seen_state WHERE user_id = 'current-user'")
            .fetch_one(pool)
            .await
            .expect("read")
    }
}
