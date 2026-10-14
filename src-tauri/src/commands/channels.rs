//! Channel/Subscription commands

use crate::db::Database;
use crate::types::*;
use tauri::{command, State};

#[command]
pub async fn list(db: State<'_, Database>, params: Option<ChannelListParams>) -> std::result::Result<Vec<Channel>, String> {
    db.list_channels(params).await
}

#[derive(serde::Deserialize)]
pub struct ChannelListParams {
    #[serde(rename = "type")]
    pub channel_type: Option<ChannelType>,
    pub filter: Option<String>,
}

#[command]
pub async fn subscribe(
    db: State<'_, Database>,
    external_id: String,
    channel_type: ChannelType,
    instance_id: Option<String>,
) -> std::result::Result<Channel, String> {
    let now = chrono::Utc::now().to_rfc3339();
    let channel = Channel {
        id: uuid::Uuid::new_v4().to_string(),
        user_id: "current-user".to_string(), // TODO: get from auth
        external_id,
        title: "Loading...".to_string(),
        handle: None,
        thumbnail_url: None,
        description: None,
        subscriber_count: None,
        is_subscribed: true,
        subscribed_at: now.clone(),
        notifications_enabled: true,
        format_preference: Format::Unified,
        instance_id,
        channel_type,
        podcast_feed_url: None,
        podcast_guid: None,
        last_fetched_at: None,
        created_at: now.clone(),
        updated_at: now,
    };
    
    // TODO: Fetch channel metadata from instance
    // For now, insert with placeholder data
    // db.insert_channel(&channel).await?;
    
    Ok(channel)
}

#[command]
pub async fn unsubscribe(db: State<'_, Database>, channel_id: String) -> std::result::Result<(), String> {
    // db.delete_channel(&channel_id).await?;
    Ok(())
}

#[command]
pub async fn import(
    db: State<'_, Database>,
    source: String,
    data: String,
) -> std::result::Result<ImportResult, String> {
    // TODO: Parse YouTube export or OPML
    Ok(ImportResult { imported: 0, errors: vec![] })
}

#[derive(serde::Serialize)]
pub struct ImportResult {
    pub imported: u32,
    pub errors: Vec<String>,
}

#[command]
pub async fn export(
    db: State<'_, Database>,
    format: String,
) -> std::result::Result<String, String> {
    // TODO: Export subscriptions as JSON or OPML
    Ok("".to_string())
}
