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
        "ALTER TABLE user_preferences ADD COLUMN card_click_action TEXT NOT NULL DEFAULT 'auto'",
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
    // The app is single-user: every channel (and so every stored search
    // result) FKs to this row. It used to exist only in scripts/seed.sql and
    // the test fixtures, so a real install could store nothing.
    pool.execute("INSERT OR IGNORE INTO users (id) VALUES ('current-user')")
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}