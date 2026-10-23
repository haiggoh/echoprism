//! Channel/Subscription commands

use crate::db::Database;
use crate::types::*;
use serde::Serialize;
use std::collections::HashMap;
use tauri::{command, State};

/// Live-test finding: the subscriptions overview must link to each
/// channel's home. Video channels live at their YouTube channel id;
/// podcast channels at the feed's published site link (podcast_feeds.link,
/// stored at subscribe). A channel with neither carries NO link — nothing
/// invented.
pub fn home_url_for(
    channel_type: &ChannelType,
    external_id: &str,
    podcast_feed_url: Option<&str>,
    feed_links: &HashMap<String, String>,
) -> Option<String> {
    match channel_type {
        ChannelType::Podcast => podcast_feed_url
            .and_then(|u| feed_links.get(u))
            .cloned(),
        ChannelType::Video => Some(format!("https://www.youtube.com/channel/{external_id}")),
        ChannelType::Both => podcast_feed_url
            .and_then(|u| feed_links.get(u))
            .cloned()
            .or_else(|| Some(format!("https://www.youtube.com/channel/{external_id}"))),
    }
}

/// The list response: the channel plus its derived home link.
#[derive(Serialize)]
pub struct ChannelWithHome {
    #[serde(flatten)]
    pub channel: Channel,
    pub home_url: Option<String>,
}

#[command]
pub async fn list(db: State<'_, Database>, params: Option<ChannelListParams>) -> std::result::Result<Vec<ChannelWithHome>, String> {
    let channels = db.list_channels(params).await?;
    let feed_links = db.podcast_feed_links().await?;
    Ok(channels
        .into_iter()
        .map(|channel| {
            let home_url = home_url_for(
                &channel.channel_type,
                &channel.external_id,
                channel.podcast_feed_url.as_deref(),
                &feed_links,
            );
            ChannelWithHome { channel, home_url }
        })
        .collect())
}

#[derive(serde::Deserialize)]
pub struct ChannelListParams {
    #[serde(rename = "type")]
    pub channel_type: Option<ChannelType>,
}

#[cfg(test)]
mod home_url_tests {
    use super::*;

    fn links(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs.iter().map(|(u, l)| (u.to_string(), l.to_string())).collect()
    }

    /// The derivation is the Channels screen's link contract: video → the
    /// YouTube channel id; podcast → the feed's site link ONLY when one
    /// exists (a feed without a site gets NO link — nothing invented).
    #[test]
    fn home_urls_derive_per_channel_type() {
        let feed_links = links(&[("https://feeds.example/show.xml", "https://example.com/show")]);

        let video = home_url_for(&ChannelType::Video, "UCddiUEpeqJcYeBxX1IVBKvQ", None, &feed_links);
        assert_eq!(
            video.as_deref(),
            Some("https://www.youtube.com/channel/UCddiUEpeqJcYeBxX1IVBKvQ")
        );

        let podcast = home_url_for(
            &ChannelType::Podcast,
            "https://feeds.example/show.xml",
            Some("https://feeds.example/show.xml"),
            &feed_links,
        );
        assert_eq!(podcast.as_deref(), Some("https://example.com/show"));

        // A podcast feed with no site link: NO home link, not a feed URL.
        let linkless = home_url_for(
            &ChannelType::Podcast,
            "https://feeds.example/bare.xml",
            Some("https://feeds.example/bare.xml"),
            &feed_links,
        );
        assert!(linkless.is_none(), "no invented link: {linkless:?}");

        // A two-stream channel prefers the feed's site, falling back to the
        // YouTube channel.
        let both = home_url_for(
            &ChannelType::Both,
            "UCddiUEpeqJcYeBxX1IVBKvQ",
            Some("https://feeds.example/bare.xml"),
            &feed_links,
        );
        assert_eq!(
            both.as_deref(),
            Some("https://www.youtube.com/channel/UCddiUEpeqJcYeBxX1IVBKvQ")
        );
    }
}

#[command]
pub async fn subscribe(
    _db: State<'_, Database>,
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
        format_preference: Format::Both,
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
pub async fn unsubscribe(_db: State<'_, Database>, _channel_id: String) -> std::result::Result<(), String> {
    // db.delete_channel(&channel_id).await?;
    Ok(())
}

#[command]
pub async fn import(
    _db: State<'_, Database>,
    _source: String,
    _data: String,
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
    _db: State<'_, Database>,
    _format: String,
) -> std::result::Result<String, String> {
    // TODO: Export subscriptions as JSON or OPML
    Ok("".to_string())
}
