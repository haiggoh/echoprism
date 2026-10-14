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

async fn migrate_data(_pool: &sqlx::SqlitePool) -> Result<(), String> {
    // Future data migrations go here
    Ok(())
}