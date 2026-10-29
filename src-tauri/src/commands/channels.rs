//! Channel/Subscription commands

use crate::db::Database;
use crate::instance_pool::InstancePool;
use crate::podcast::{ImportResult, PodcastManager};
use crate::types::*;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
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
    /// Subscriptions only. OMITTED means true: the Channels screen calls
    /// `list()` bare and must not see the search-saved channels the owner
    /// never subscribed to (103 of them on the live DB, 2026-10-27).
    #[serde(rename = "subscribedOnly", default)]
    pub subscribed_only: Option<bool>,
}

#[cfg(test)]
mod opml_tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    /// The export: valid OPML 2.0, one rss outline per feed, entities
    /// escaped (a title with an ampersand must not break the XML).
    #[test]
    fn build_opml_export_escapes_and_shapes() {
        let out = build_opml_export(&[
            ("Echo & Prism".into(), "https://feeds.example/show.xml".into()),
            ("Quotes \"and\" <angles>".into(), "https://feeds.example/q.xml".into()),
        ]);
        assert!(out.starts_with("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"));
        assert!(out.contains("<opml version=\"2.0\">"));
        assert!(out.contains("text=\"Echo \u{26}amp; Prism\""), "the ampersand is XML-escaped: {out}");
        assert!(out.contains("xmlUrl=\"https://feeds.example/show.xml\""));
        assert!(out.contains("text=\"Quotes \u{26}quot;and\u{26}quot; \u{26}lt;angles\u{26}gt;\""));
        // The raw ampersand must not survive unescaped anywhere.
        assert!(!out.contains(" & "));
    }

    /// The import's registration half: idempotent on the feed URL, one
    /// channel + one podcast_feeds row, last_fetched_at NULL (the refresh's
    /// due check fires immediately — that is HOW imported feeds get their
    /// episodes).
    #[tokio::test]
    async fn register_podcast_feed_is_idempotent_and_due() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("connect");
        crate::db::migrations::run(&pool).await.expect("migrations");

        let first = crate::db::queries::register_podcast_feed(&pool, "https://feeds.example/show.xml", "The Show")
            .await
            .expect("register");
        let again = crate::db::queries::register_podcast_feed(&pool, "https://feeds.example/show.xml", "The Show")
            .await
            .expect("re-register");
        assert_eq!((first, again), (true, false), "idempotent on the feed URL");

        let channel_rows: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM channels WHERE external_id = 'https://feeds.example/show.xml'")
            .fetch_one(&pool)
            .await
            .expect("count");
        let feed_rows: (i64, Option<String>) = sqlx::query_as(
            "SELECT COUNT(*), MIN(last_fetched_at) FROM podcast_feeds WHERE feed_url = 'https://feeds.example/show.xml'",
        )
        .fetch_one(&pool)
        .await
        .expect("count feeds");
        assert_eq!(channel_rows, 1, "no duplicate channels");
        assert_eq!(feed_rows.0, 1, "no duplicate podcast_feeds rows");
        assert!(feed_rows.1.is_none(), "last_fetched_at NULL = due immediately");
    }
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

/// Flag an EXISTING channel back as subscribed (live-test batch 2, Task 8:
/// "subscriptions seem to be missing, there's no obvious way to subscribe to a
/// channel").
///
/// Deliberately NOT the `subscribe` command, which INSERTs a new channel row:
/// calling it for a channel that already exists would duplicate the channel and
/// detach its episodes. This is the UPDATE mirror of `unsubscribe`.
#[command]
pub async fn resubscribe(db: State<'_, Database>, channel_id: String) -> std::result::Result<(), String> {
    db.subscribe_channel(&channel_id).await
}

/// Live-test Task 4: a REAL unsubscribe. Was a no-op stub that returned Ok(())
/// without touching the database, so the button appeared to work and did
/// nothing. The channel ROW is kept (owner decision 2026-10-27: hidden, never
/// deleted) — only the subscription flag clears — and an unknown id is an Err,
/// never a silent success.
#[command]
pub async fn unsubscribe(db: State<'_, Database>, channel_id: String) -> std::result::Result<(), String> {
    db.unsubscribe_channel(&channel_id).await
}

/// Resolve (and remember) a channel's avatar — "the should have small profile
/// pictures" (live-test Task 10).
///
/// Returns the URL to show. A podcast channel's art comes from its feed's
/// `<itunes:image>`, already stored by the Task 9 parse and the Task 10a refresh
/// backfill, so a podcast with no stored art is a feed that publishes none —
/// nothing to resolve. A video channel has no feed, so its art comes from an
/// Invidious instance's `/api/v1/channels/{ucid}`.
///
/// Fails SOFT: no instance, no art, a dead instance — all return None rather
/// than an Err, because the caller is a list of rows that has nothing useful to
/// do with the reason. Only an already-present avatar short-circuits the
/// network entirely, which is what keeps repeat calls free.
#[command]
pub async fn resolve_channel_avatar(
    db: State<'_, Database>,
    pool: State<'_, InstancePool>,
    channel_id: String,
) -> std::result::Result<Option<String>, String> {
    let row = db.channel_for_avatar(&channel_id).await?;
    let Some(channel) = row else {
        return Ok(None);
    };
    if let Some(existing) = channel.thumbnail_url.as_deref() {
        return Ok(Some(existing.to_string()));
    }

    // A podcast's art is feed-derived and already stored, so there is nothing
    // to resolve — returning early avoids a pointless Invidious lookup for a
    // feed URL that is not a channel id.
    if channel.channel_type != ChannelType::Video {
        return Ok(None);
    }

    if let Some(art) = pool.fetch_channel_art(&channel.external_id).await {
        // NULL-only: concurrent resolution of several rows must not let a slow,
        // worse answer overwrite a good one already on screen.
        db.set_channel_thumbnail_if_missing(&channel_id, &art).await?;
        return Ok(Some(art));
    }
    Ok(None)
}

/// Live-test feature (the 1c unwired contract): OPML import — registration
/// without fetching (the background refresh fetches). Only `opml` is
/// accepted; the error says so otherwise.
#[command]
pub async fn import(
    podcast: State<'_, Arc<PodcastManager>>,
    source: String,
    data: String,
) -> std::result::Result<ImportResult, String> {
    if source != "opml" {
        return Err(format!(
            "unsupported import source: {source} (opml is the supported format)"
        ));
    }
    podcast.import_opml(&data).await
}

/// Pure builder (test target): OPML 2.0, one rss outline per subscribed
/// podcast feed, entities escaped.
pub fn build_opml_export(title_feeds: &[(String, String)]) -> String {
    let mut out = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<opml version=\"2.0\">\n  <head><title>EchoPrism Subscriptions</title></head>\n  <body>\n",
    );
    for (title, feed_url) in title_feeds {
        out.push_str(&format!(
            "    <outline type=\"rss\" text=\"{}\" xmlUrl=\"{}\"/>\n",
            escape_xml(title),
            escape_xml(feed_url)
        ));
    }
    out.push_str("  </body>\n</opml>\n");
    out
}

fn escape_xml(s: &str) -> String {
    // & first, then the bracketing entities - the standard order.
    s.replace("&", "\u{26}amp;")
        .replace("<", "\u{26}lt;")
        .replace(">", "\u{26}gt;")
        .replace("\"", "\u{26}quot;")
        .replace("'", "\u{26}apos;")
}



/// Live-test feature: export the subscribed podcast feeds as OPML (the
/// podcast-portability format) or JSON.
#[command]
pub async fn export(db: State<'_, Database>, format: String) -> std::result::Result<String, String> {
    let params = ChannelListParams {
        channel_type: Some(ChannelType::Podcast),
        // None resolves to "subscriptions only", which is what an OPML export
        // of MY feeds means — an unsubscribed channel is nobody's subscription.
        subscribed_only: None,
    };
    let channels = db.list_channels(Some(params)).await?;
    let feeds: Vec<(String, String)> = channels
        .into_iter()
        .filter_map(|c| c.podcast_feed_url.map(|u| (c.title, u)))
        .collect();
    match format.as_str() {
        "opml" => Ok(build_opml_export(&feeds)),
        "json" => serde_json::to_string(
            &feeds
                .iter()
                .map(|(title, feed_url)| {
                    serde_json::json!({ "title": title, "feed_url": feed_url })
                })
                .collect::<Vec<_>>(),
        )
        .map_err(|e| e.to_string()),
        other => Err(format!(
            "unsupported export format: {other} (opml or json)"
        )),
    }
}
