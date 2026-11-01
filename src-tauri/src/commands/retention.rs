//! Retention commands (waypoint echoprism-hidden-row-retention, owner decision
//! 2026-10-31): hidden (unsubscribed) channels are capped — oldest pruned when
//! the cap is exceeded. The daily background cleanup loop runs the same sweep;
//! these commands expose the stats and a manual run to the Settings UI.

use crate::db::Database;
use crate::db::queries::MAX_HIDDEN_CHANNELS;
use serde::Serialize;
use tauri::{command, State};

#[derive(Serialize)]
pub struct RetentionStats {
    pub hidden_channels: i64,
    pub cap: i64,
}

#[command]
pub async fn hidden_channel_stats(db: State<'_, Database>) -> std::result::Result<RetentionStats, String> {
    let hidden = db.hidden_channel_count().await?;
    Ok(RetentionStats {
        hidden_channels: hidden,
        cap: MAX_HIDDEN_CHANNELS,
    })
}

/// Run the sweep now with the default cap. Returns how many rows were dropped.
#[command]
pub async fn prune_hidden_channels(db: State<'_, Database>) -> std::result::Result<i64, String> {
    db.prune_hidden_channels(MAX_HIDDEN_CHANNELS).await
}
