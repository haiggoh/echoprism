//! Database migrations

use sqlx::Executor;

pub async fn run(pool: &sqlx::SqlitePool) -> Result<(), String> {
    // Create tables
    create_tables(pool).await?;

    // Create indexes
    create_indexes(pool).await?;

    // Create FTS table
    create_fts(pool).await?;

    // Run data migrations
    migrate_data(pool).await?;

    Ok(())
}

async fn create_tables(pool: &sqlx::SqlitePool) -> Result<(), String> {
    let schema = include_str!("../../sql/schema.sql");
    pool.execute(schema).await.map_err(|e| e.to_string())?;
    Ok(())
}

async fn create_indexes(pool: &sqlx::SqlitePool) -> Result<(), String> {
    let indexes = include_str!("../../sql/indexes.sql");
    pool.execute(indexes).await.map_err(|e| e.to_string())?;
    Ok(())
}

async fn create_fts(pool: &sqlx::SqlitePool) -> Result<(), String> {
    let fts = include_str!("../../sql/fts.sql");
    pool.execute(fts).await.map_err(|e| e.to_string())?;
    Ok(())
}

async fn migrate_data(pool: &sqlx::SqlitePool) -> Result<(), String> {
    // Idempotent column additions for databases created before a column
    // existed (CREATE TABLE IF NOT EXISTS does not alter existing tables).
    let alters = [
        "ALTER TABLE user_preferences ADD COLUMN card_click_action TEXT NOT NULL DEFAULT 'queue'",
    ];
    for stmt in alters {
        // "duplicate column name" means this database already has the column.
        if let Err(e) = pool.execute(stmt).await {
            let msg = e.to_string();
            if !msg.contains("duplicate column name") {
                return Err(msg);
            }
        }
    }
    // Batch 3 (owner decision 2026-11-02): 'auto' is retired in favour of
    // 'queue'. Rewrite stored rows so the DB says what the app does.
    pool.execute("UPDATE user_preferences SET card_click_action = 'queue' WHERE card_click_action = 'auto'")
        .await
        .map_err(|e| e.to_string())?;
    // The app is single-user: every channel (and so every stored search
    // result) FKs to this row. It used to exist only in scripts/seed.sql and
    // the test fixtures, so a real install could store nothing.
    pool.execute("INSERT OR IGNORE INTO users (id) VALUES ('current-user')")
        .await
        .map_err(|e| e.to_string())?;
    // Same story, one table over: the user_preferences row was only seeded
    // by scripts/seed.sql and the test fixtures. get_preferences treats a
    // missing row as an error and the settings command saves via
    // read-modify-write, so on a real install reading AND saving preferences
    // failed with "Preferences not found" (live-confirmed 2026-11-11: the
    // audio-only toggle could not persist). Every column has a schema
    // DEFAULT, so the seed names only the key.
    pool.execute("INSERT OR IGNORE INTO user_preferences (user_id) VALUES ('current-user')")
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}