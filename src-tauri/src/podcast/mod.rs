//! Podcast RSS/Atom/JSON Feed parser with OPML import/export

use crate::types::*;
use crate::db::Database;
use tauri::{AppHandle, Manager};
use reqwest::Client;
use std::sync::Arc;
use rss::Channel as RssChannel;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use futures::StreamExt;

/// How many feed FETCHES may be in flight at once during a refresh.
/// Network-bound work on a desktop client: 4 gives ~4x wall-clock on the
/// common path while keeping ≤4 parallel hits per feed host (RSS
/// politeness). Stores are sequential by design — see
/// refresh_due_feeds_with.
const FEED_REFRESH_CONCURRENCY: usize = 4;
use chrono::{DateTime, Utc};

pub struct PodcastManager {
    client: reqwest::Client,
    db: Arc<Database>,
}

impl PodcastManager {
    pub fn new(app_handle: AppHandle) -> Self {
        let db = app_handle.state::<Database>().inner().clone();
        
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .user_agent("EchoPrism/0.1 (+https://echoprism.app)")
                .build()
                .expect("Failed to create HTTP client"),
            db: Arc::new(db),
        }
    }
    
    /// Fetch and parse a podcast feed
    pub async fn fetch_feed(&self, feed_url: &str) -> Result<PodcastFeedData, String> {
        Self::fetch_feed_with(&self.client, feed_url).await
    }

    /// Client-only core of [`Self::fetch_feed`] — `pub(crate)` so the 1d
    /// live smoke can exercise the real fetch path without app state.
    pub(crate) async fn fetch_feed_with(client: &Client, feed_url: &str) -> Result<PodcastFeedData, String> {
        let response = client.get(feed_url)
            .header("Accept", "application/rss+xml, application/atom+xml, application/json, text/xml")
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Feed fetch failed: {}", response.status()));
        }

        let content = response.bytes().await
            .map_err(|e| format!("Failed to read response: {}", e))?;

        // Try to detect feed format and parse
        let content_str = String::from_utf8_lossy(&content);

        if content_str.trim().starts_with("<?xml") || content_str.trim().starts_with("<rss") || content_str.trim().starts_with("<feed") {
            // XML-based feed (RSS or Atom)
            if content_str.contains("<rss") || content_str.contains("<channel>") {
                Self::parse_rss(&content_str)
            } else if content_str.contains("<feed") || content_str.contains("xmlns=\"http://www.w3.org/2005/Atom\"") {
                // Atom feeds are not implemented yet — an explicit error
                // beats a silent empty success that would look like "0
                // episodes".
                Err("Atom feeds are not supported yet".to_string())
            } else {
                Err("Unknown XML feed format".to_string())
            }
        } else if content_str.trim().starts_with('{') {
            // JSON Feed
            Self::parse_json_feed(&content_str)
        } else {
            Err("Unsupported feed format".to_string())
        }
    }
    
    fn parse_rss(content: &str) -> Result<PodcastFeedData, String> {
        let channel: RssChannel = rss::Channel::read_from(content.as_bytes())
            .map_err(|e| format!("Failed to parse RSS: {}", e))?;

        // Live-test Task 9. The line at the bottom of this function used to read
        // `thumbnail_url: None, // channel.itunes_image not available` — false:
        // the rss crate exposes `itunes_ext().image()` on the channel and on
        // every item. 0 of the owner's 1,102 podcast episodes had any art.
        //
        // Two channel-art sources, in order: the podcast-specific
        // <itunes:image> (matched by NAMESPACE, so a feed publishing it under a
        // generated prefix such as <ns1:image> still resolves — Vergecast does
        // exactly that), then the plain RSS <image><url>, which is the standard
        // mechanism and what remains when a feed has no itunes block at all.
        let channel_thumbnail = channel
            .itunes_ext()
            .and_then(|ext| ext.image())
            .map(|s| s.to_string())
            .or_else(|| channel.image().and_then(|img| Some(img.url.clone())).filter(|u| !u.trim().is_empty()));

        let mut episodes = Vec::new();
        for item in channel.items {
            let guid = item.guid.as_ref().map(|g| g.value.clone()).unwrap_or_else(|| {
                item.link.clone().unwrap_or_else(|| uuid::Uuid::new_v4().to_string())
            });
            // Read before the moves below: `item.description` is moved into the
            // struct, which would make a later `item.itunes_ext()` a borrow of
            // a partially moved value.
            let duration_seconds = item
                .itunes_ext()
                .and_then(|ext| ext.duration())
                .and_then(parse_duration);
            // An item's OWN artwork, else the show's — a podcast episode without
            // its own `<itunes:image>` is normal, and the show art is the right
            // thing to display rather than a generic headphones icon.
            let thumbnail_url = item
                .itunes_ext()
                .and_then(|ext| ext.image())
                .map(|s| s.to_string())
                .or_else(|| channel_thumbnail.clone());

            episodes.push(PodcastEpisode {
                id: uuid::Uuid::new_v4().to_string(),
                guid,
                title: item.title.unwrap_or_default(),
                description: item.description,
                channel_title: Some(channel.title.clone()),
                channel_id: None,
                published_at: item.pub_date.as_ref().and_then(|d| DateTime::parse_from_rfc2822(d).ok().map(|dt| DateTimeUtc(dt.with_timezone(&Utc)))),
                duration_seconds,
                audio_url: item.enclosure.as_ref().map(|e| e.url.clone()),
                transcript: None,
                thumbnail_url,
            });
        }

        Ok(PodcastFeedData {
            title: channel.title,
            description: Some(channel.description),
            link: Some(channel.link),
            language: channel.language,
            author: None, // channel.itunes_author not available
            categories: channel.categories.iter().map(|c| c.name.clone()).collect(),
            thumbnail_url: channel_thumbnail,
            episodes,
        })
    }
    
    fn parse_json_feed(content: &str) -> Result<PodcastFeedData, String> {
        let value: Value = serde_json::from_str(content)
            .map_err(|e| format!("Failed to parse JSON Feed: {}", e))?;
        
        let mut episodes = Vec::new();
        // The feed's own image, hoisted so an item without one can inherit it
        // (same shape as the RSS path's channel itunes_image).
        let feed_image = value
            .get("icon")
            .or_else(|| value.get("favicon"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        if let Some(items) = value.get("items").and_then(|v| v.as_array()) {
            for item in items {
                let guid = item.get("id").and_then(|v| v.as_str().map(|s| s.to_string())).unwrap_or_else(|| {
                    item.get("url").and_then(|v| v.as_str().map(|s| s.to_string())).unwrap_or_else(|| uuid::Uuid::new_v4().to_string())
                });
                
                let published = item.get("date_published").and_then(|v| v.as_str())
                    .and_then(|s| DateTime::parse_from_rfc3339(s).ok().map(|dt| DateTimeUtc(dt.with_timezone(&Utc))));
                
                let audio_url = item.get("attachments").and_then(|v| v.as_array())
                    .and_then(|arr| arr.iter().find(|a| a.get("mime_type").and_then(|m| m.as_str()).map(|m| m.starts_with("audio/")).unwrap_or(false)))
                    .and_then(|a| a.get("url").and_then(|v| v.as_str()).map(|s| s.to_string()));
                
                // JSON Feed: an item's own `image`/`icon`, else the feed's —
                // same shape as the RSS path's itunes_image inheritance.
                let item_image = item
                    .get("image")
                    .or_else(|| item.get("icon"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                episodes.push(PodcastEpisode {
                    id: uuid::Uuid::new_v4().to_string(),
                    guid: guid.to_string(),
                    title: item.get("title").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                    description: item.get("content_html").or_else(|| item.get("summary")).and_then(|v| v.as_str()).map(|s| s.to_string()),
                    channel_title: None,
                    channel_id: None,
                    published_at: published,
                    duration_seconds: None,
                    audio_url,
                    transcript: None,
                    thumbnail_url: item_image.or_else(|| feed_image.clone()),
                });
            }
        }
        
        Ok(PodcastFeedData {
            title: value.get("title").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
            description: value.get("description").and_then(|v| v.as_str()).map(|s| s.to_string()),
            link: value.get("home_page_url").and_then(|v| v.as_str()).map(|s| s.to_string()),
            language: value.get("language").and_then(|v| v.as_str()).map(|s| s.to_string()),
            author: value.get("author").and_then(|v| v.get("name")).and_then(|v| v.as_str()).map(|s| s.to_string()),
            categories: value.get("categories").and_then(|v| v.as_array()).map(|arr| arr.iter().filter_map(|v| v.as_str()).map(|s| s.to_string()).collect()).unwrap_or_default(),
            thumbnail_url: feed_image.clone(),
            episodes,
        })
    }
    
    /// Import subscriptions from OPML — WIRED (the 1c unwired-future
    /// contract): registration WITHOUT fetching. Importing must not make N
    /// network fetches (bot-block-prone, slow); registering the channel +
    /// podcast_feeds rows (last_fetched_at NULL) hands the work to the
    /// background refresh, whose due check fires immediately. Idempotent on
    /// the feed URL; duplicates are skipped, not errors.
    pub async fn import_opml(&self, opml_content: &str) -> Result<ImportResult, String> {
        let doc = roxmltree::Document::parse(opml_content)
            .map_err(|e| format!("Failed to parse OPML: {}", e))?;

        let mut imported = 0;
        let mut errors: Vec<String> = Vec::new();
        let mut seen = std::collections::HashSet::new();

        for node in doc.descendants().filter(|n| n.tag_name().name() == "outline") {
            if let Some(xml_url) = node.attribute("xmlUrl") {
                let feed_url = xml_url.trim().to_string();
                if feed_url.is_empty() || !seen.insert(feed_url.clone()) {
                    continue;
                }
                let title = node.attribute("title").or(node.attribute("text")).unwrap_or("Unknown").to_string();
                match self.db.register_podcast_feed(&feed_url, &title).await {
                    Ok(true) => imported += 1,
                    Ok(false) => {}
                    Err(e) => errors.push(format!("Failed to register {feed_url}: {e}")),
                }
            }
        }

        Ok(ImportResult { imported, errors })
    }
    
    /// Persistence half of import_opml (kept with it, see import_opml); its
    /// inserts are still commented out and must become a call to the 1c
    /// Search the iTunes podcast directory (no key or account required;
    /// Podcast Index is deferred). Each result's feedUrl is the subscribe
    /// target.
    pub async fn search_itunes(&self, term: &str) -> Result<Vec<PodcastSearchResult>, String> {
        Self::search_itunes_with(&self.client, term).await
    }

    /// Client-only core of [`Self::search_itunes`] — `pub(crate)` for the
    /// 1d live smoke, same reasoning as [`Self::fetch_feed_with`].
    pub(crate) async fn search_itunes_with(client: &Client, term: &str) -> Result<Vec<PodcastSearchResult>, String> {
        let term = term.trim();
        if term.is_empty() {
            return Ok(Vec::new());
        }
        let response = client
            .get("https://itunes.apple.com/search")
            .query(&[("term", term), ("media", "podcast"), ("limit", "25")])
            .send()
            .await
            .map_err(|e| format!("iTunes search failed: {}", e))?;
        if !response.status().is_success() {
            return Err(format!("iTunes search returned {}", response.status()));
        }
        let body = response
            .text()
            .await
            .map_err(|e| format!("Failed to read iTunes response: {}", e))?;
        parse_itunes_search(&body)
    }

    /// Refresh every due podcast feed: fetch, parse, store new episodes.
    /// Returns how many feeds were refreshed; one failing feed never stops
    /// the others.
    pub async fn refresh_due_feeds(&self) -> Result<usize, String> {
        let due = self.db.due_podcast_feeds().await?;
        // Each future gets its own Arc handle clone (cheap; the connection
        // pool underneath is shared, so reuse is preserved — building a
        // whole new Client per feed is what would lose it).
        let client = self.client.clone();
        self.refresh_due_feeds_with(&due, move |url| {
            let client = client.clone();
            async move { Self::fetch_feed_with(&client, &url).await }
        })
        .await
    }

    /// Refresh a due set with the given fetch strategy. FETCHES overlap up
    /// to [`FEED_REFRESH_CONCURRENCY`] in flight (`buffer_unordered` drives
    /// the futures inline on the caller's task, so the cap structurally
    /// bounds spawn); STORES run sequentially — the network is where the
    /// wall-clock goes, and concurrent write transactions on one SQLite
    /// file take an immediate SQLITE_BUSY (deferred-upgrade deadlock
    /// avoidance; busy_timeout does not retry it — measured: 2 of 4
    /// concurrent upserts failed with code 5). Per-feed isolation is
    /// structural: a fetch or store failure warns and moves on, the feed
    /// stays due (its last_fetched_at is only touched after a successful
    /// upsert), and the return count is feeds whose fetch AND store both
    /// succeeded.
    pub(crate) async fn refresh_due_feeds_with<F, Fut>(&self, due: &[(String, String)], fetch: F) -> Result<usize, String>
    where
        F: Fn(String) -> Fut,
        Fut: std::future::Future<Output = Result<PodcastFeedData, String>>,
    {
        let fetched = futures::stream::iter(due.iter().cloned())
            .map(move |(feed_url, stored_title)| {
                let fut = fetch(feed_url.clone());
                async move { (feed_url, stored_title, fut.await) }
            })
            .buffer_unordered(FEED_REFRESH_CONCURRENCY)
            .collect::<Vec<_>>()
            .await;

        let mut refreshed = 0usize;
        for (feed_url, stored_title, result) in fetched {
            match result {
                Ok(data) => {
                    let fallback = if stored_title.is_empty() {
                        data.title.clone()
                    } else {
                        stored_title.clone()
                    };
                    match self
                        .db
                        .upsert_podcast_subscription(&feed_url, &fallback, &data)
                        .await
                    {
                        Ok((_, new_episodes)) => {
                            let _ = self.db.touch_podcast_fetch(&feed_url).await;
                            if new_episodes > 0 {
                                tracing::info!(
                                    "Feed '{}': {} new episode(s)",
                                    feed_url,
                                    new_episodes
                                );
                            }
                            refreshed += 1;
                        }
                        Err(e) => tracing::warn!("Storing feed {} failed: {}", feed_url, e),
                    }
                }
                Err(e) => tracing::warn!("Fetching feed {} failed: {}", feed_url, e),
            }
        }
        Ok(refreshed)
    }

    /// Import subscriptions from YouTube (via an Invidious instance).
    ///
    /// Phase 3: this was an unwired stub that built a `Channel` per subscription
    /// and then DISCARDED it — its `insert_channel` call was commented out — so
    /// it returned `imported: N` for work it never performed, which is worse
    /// than an unreachable button: a confident count for nothing. It now
    /// persists, and it dedupes on `external_id` (the Invidious `authorId`)
    /// because `insert_channel` has no existence check of its own — the same
    /// guard `register_podcast_feed` uses for OPML.
    ///
    /// Fetch and persist are split so the persistence half is testable offline:
    /// `import_from_youtube_with` takes the client, and
    /// [`import_subscriptions`] takes already-parsed subscriptions.
    pub async fn import_from_youtube(&self, instance_url: &str) -> Result<ImportResult, String> {
        Self::import_from_youtube_with(&self.client, &self.db, instance_url).await
    }

    /// Client/DB-taking core of [`Self::import_from_youtube`], mirroring the
    /// `fetch_feed_with` / `search_itunes_with` seam so the decision logic has
    /// no app-state dependency.
    pub(crate) async fn import_from_youtube_with(
        client: &Client,
        db: &Arc<Database>,
        instance_url: &str,
    ) -> Result<ImportResult, String> {
        let url = format!("{}/api/v1/subscriptions", instance_url.trim_end_matches('/'));

        let response = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!(
                "Failed to fetch subscriptions: {} from {}",
                response.status(),
                url
            ));
        }

        let subscriptions: Vec<YoutubeSubscription> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse subscriptions: {}", e))?;

        import_subscriptions_db(db, &subscriptions).await
    }
}

/// The persistence half of the YouTube import: map each subscription to a
/// channel, skip the ones already present under the same `external_id`, insert
/// the rest, and report a count that reflects reality.
///
/// Free-standing (not a method) so tests can drive it with a temp-DB pool and
/// no app handle, exactly like the OPML path's use of `register_podcast_feed`.
/// Test-only: production reaches `import_subscriptions_db` through
/// `import_from_youtube_with`.
#[cfg(test)]
pub(crate) async fn import_subscriptions(
    manager: &PodcastManager,
    subscriptions: &[YoutubeSubscription],
) -> Result<ImportResult, String> {
    import_subscriptions_db(&manager.db, subscriptions).await
}

async fn import_subscriptions_db(
    db: &Arc<Database>,
    subscriptions: &[YoutubeSubscription],
) -> Result<ImportResult, String> {
    let mut imported: u32 = 0;
    let mut errors: Vec<String> = Vec::new();

    // One existence query up front rather than one per row: the count is small
    // (a user's subscriptions) and this keeps the loop free of per-row SELECTs.
    let existing_ids: std::collections::HashSet<String> =
        match db.list_channels(None).await {
            Ok(channels) => channels
                .into_iter()
                .map(|c| c.external_id)
                .collect(),
            Err(e) => return Err(format!("Failed to read existing channels: {}", e)),
        };

    for sub in subscriptions {
        // `external_id` is the dedupe key: Invidious reports the same channel
        // on every sync, and without this the same import run twice would grow
        // the list (and keep reporting a rising count).
        if existing_ids.contains(&sub.author_id) {
            continue;
        }
        let channel = channel_from_subscription(sub);
        match db.insert_channel(&channel).await {
            Ok(()) => imported += 1,
            Err(e) => errors.push(format!("Failed to import {}: {}", sub.author, e)),
        }
    }

    Ok(ImportResult { imported, errors })
}

/// Map one Invidious subscription to the app's Channel shape. Pure — no DB, no
/// network — so the mapping is pinned by a unit test (`youtube_import_tests`).
fn channel_from_subscription(sub: &YoutubeSubscription) -> Channel {
    let now = chrono::Utc::now().to_rfc3339();
    Channel {
        id: uuid::Uuid::new_v4().to_string(),
        user_id: "current-user".to_string(),
        external_id: sub.author_id.clone(),
        title: sub.author.clone(),
        handle: Some(sub.author_url.clone()),
        // The first tier only; an empty thumbnail list is a real Invidious
        // shape for some channels and must not panic.
        thumbnail_url: sub.author_thumbnails.first().map(|t| t.url.clone()),
        description: None,
        subscriber_count: Some(sub.subscriber_count as i64),
        is_subscribed: true,
        subscribed_at: now.clone(),
        // Off by default, matching the OPML path (register_podcast_feed): an
        // import must not start notifying about dozens of channels at once.
        notifications_enabled: false,
        format_preference: crate::types::Format::Both,
        instance_id: None,
        channel_type: crate::types::ChannelType::Video,
        podcast_feed_url: None,
        podcast_guid: None,
        last_fetched_at: None,
        created_at: now.clone(),
        updated_at: now,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PodcastFeedData {
    pub title: String,
    pub description: Option<String>,
    pub link: Option<String>,
    pub language: Option<String>,
    pub author: Option<String>,
    pub categories: Vec<String>,
    pub thumbnail_url: Option<String>,
    pub episodes: Vec<PodcastEpisode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PodcastEpisode {
    pub id: String,
    pub guid: String,
    pub title: String,
    pub description: Option<String>,
    pub channel_title: Option<String>,
    pub channel_id: Option<String>,
    pub published_at: Option<DateTimeUtc>,
    pub duration_seconds: Option<u64>,
    pub audio_url: Option<String>,
    pub transcript: Option<String>,
    /// Cover art. An item's own `<itunes:image>` when it has one, otherwise the
    /// channel's — hydrated at parse time, not stored per row redundantly.
    pub thumbnail_url: Option<String>,
}

/// Unwired-future: return type of import_opml/import_from_youtube (kept with
/// them; see PodcastManager::import_opml).
#[derive(Debug, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct ImportResult {
    pub imported: u32,
    pub errors: Vec<String>,
}

/// One podcast-directory hit. `feed_url` is the subscribe target.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PodcastSearchResult {
    pub title: String,
    pub author: Option<String>,
    pub feed_url: String,
    pub artwork: Option<String>,
    pub genres: Vec<String>,
}

/// Parse an iTunes Search API response (term=&media=podcast). Entries without
/// a feed URL cannot be subscribed and are skipped.
fn parse_itunes_search(body: &str) -> Result<Vec<PodcastSearchResult>, String> {
    #[derive(Deserialize)]
    struct ItunesResponse {
        #[serde(default)]
        results: Vec<ItunesResult>,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ItunesResult {
        #[serde(default)]
        collection_name: Option<String>,
        #[serde(default)]
        artist_name: Option<String>,
        #[serde(default)]
        feed_url: Option<String>,
        #[serde(default)]
        artwork_url_600: Option<String>,
        #[serde(default)]
        genres: Vec<String>,
    }

    let resp: ItunesResponse = serde_json::from_str(body)
        .map_err(|e| format!("Failed to parse iTunes search response: {}", e))?;
    Ok(resp
        .results
        .into_iter()
        .filter(|r| r.feed_url.as_deref().map(|u| !u.trim().is_empty()).unwrap_or(false))
        .map(|r| PodcastSearchResult {
            title: r.collection_name.unwrap_or_default(),
            author: r.artist_name,
            feed_url: r.feed_url.unwrap_or_default(),
            artwork: r.artwork_url_600,
            genres: r.genres,
        })
        .collect())
}

/// Unwired future feature: shape for a YouTube-channel subscriptions import
/// (import_from_youtube), kept with it — see PodcastManager::import_opml.
#[derive(Debug, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct YoutubeSubscription {
    pub author: String,
    pub author_id: String,
    pub author_url: String,
    pub author_thumbnails: Vec<Thumbnail>,
    pub subscriber_count: u32,
}

/// Unwired-future shape, kept with YoutubeSubscription.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct Thumbnail {
    pub url: String,
    pub width: u32,
    pub height: u32,
}

/// Parse an `<itunes:duration>` value into seconds. Feeds publish HH:MM:SS,
/// H:MM:SS, MM:SS or bare seconds; anything unparseable is None so a bad feed
/// cannot put a wrong length on the timeline.
///
/// Wired in 2026-10-28 (live-test): until then this was dead code and every
/// podcast episode parsed with `duration_seconds: None`, which left the
/// player's seek path bailing on `duration <= 0` — the owner could not move
/// the podcast timeline at all, while video (which learns its duration from
/// yt-dlp) seeked fine.
fn parse_duration(duration: &str) -> Option<u64> {
    // Parse iTunes duration format (HH:MM:SS or MM:SS or seconds)
    let parts: Vec<&str> = duration.split(':').collect();
    match parts.len() {
        3 => {
            let hours = parts[0].parse::<u64>().ok()?;
            let mins = parts[1].parse::<u64>().ok()?;
            let secs = parts[2].parse::<u64>().ok()?;
            Some(hours * 3600 + mins * 60 + secs)
        }
        2 => {
            let mins = parts[0].parse::<u64>().ok()?;
            let secs = parts[1].parse::<u64>().ok()?;
            Some(mins * 60 + secs)
        }
        1 => parts[0].parse::<u64>().ok(),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ITUNES_FIXTURE: &str = include_str!("fixtures/itunes_search.json");

    /// iTunes Search results: feedUrl is the subscribe target, artworkUrl600
    /// the best artwork tier. Fixture: real capture, 2026-10-20 (one result
    /// for the term "vergecast").
    #[test]
    fn itunes_search_fixture_normalizes_to_podcast_results() {
        let results = parse_itunes_search(ITUNES_FIXTURE).expect("parse itunes fixture");
        assert_eq!(results.len(), 1);
        let r = &results[0];
        assert_eq!(r.title, "The Vergecast");
        assert_eq!(r.author.as_deref(), Some("The Verge"));
        assert_eq!(r.feed_url, "https://feeds.megaphone.fm/vergecast");
        assert!(
            r.artwork.as_deref().unwrap_or("").starts_with("https://"),
            "artwork carries the URL tier the UI consumes"
        );
    }

    /// Discriminant: malformed payloads fail rather than yield empty-Ok.
    #[test]
    fn malformed_itunes_payload_fails() {
        assert!(parse_itunes_search("{\"results\": [").is_err());
    }

    const VERGECAST_FEED: &str = include_str!("fixtures/vergecast_feed.xml");
    const SOME_MORE_NEWS_FEED: &str = include_str!("fixtures/some_more_news_feed.xml");

    /// Real captured Vergecast feed (megaphone.fm, 2026-10-20, trimmed to 2
    /// items): the RSS path must produce a titled feed whose episodes keep
    /// their guid and enclosure audio URL — those are the subscribe/refresh
    /// and playback keys.
    #[test]
    fn vergecast_rss_fixture_parses_with_audio_enclosures() {
        let data = PodcastManager::parse_rss(VERGECAST_FEED).expect("parse vergecast feed");
        assert_eq!(data.title, "The Vergecast");
        assert_eq!(data.episodes.len(), 2);
        assert_eq!(
            data.episodes[0].guid, "4a88488a-6e7b-11f1-94bf-5f9c141d6644"
        );
        assert!(
            data.episodes[0]
                .audio_url
                .as_deref()
                .unwrap_or("")
                .starts_with("https://www.podtrac.com/"),
            "enclosure audio URL must survive parsing"
        );
    }

    // ---- RSS2-R-1: episode DURATION ----
    // Live-test 2026-10-28: the owner cannot jump the timeline on a podcast
    // ("I can't jump around on the timeline while its playing … the issue
    // seems to affect only podcast"), while video seeks fine. Measured cause:
    // the seek handler bails on `duration <= 0`, and every one of the owner's
    // 1,103 podcast episodes has duration_seconds NULL — because parse_rss
    // hard-codes None and the `parse_duration` helper written for exactly this
    // was never wired in (it carried #[allow(dead_code)]).

    #[test]
    fn rss_parses_itunes_duration_into_seconds() {
        let data = PodcastManager::parse_rss(SOME_MORE_NEWS_FEED).expect("parse feed");
        let first = &data.episodes[0];
        assert_eq!(
            first.duration_seconds,
            Some(2003),
            "00:33:23 must parse to 2003 seconds — without it the timeline is dead"
        );
        // HH:MM:SS on a longer item too, so the hours branch is covered.
        assert!(
            data.episodes.iter().any(|e| e.duration_seconds == Some(3741)),
            "01:02:21 must parse to 3741 seconds"
        );
    }

    #[test]
    fn rss_item_without_its_own_duration_stays_none() {
        // A fixture built for this case: the SECOND item publishes no
        // <itunes:duration>. Its length must stay None — never borrowed from
        // the sibling item, which would put a WRONG length on the timeline and
        // make a seek land somewhere the audio is not.
        //
        // (An earlier version of this test asserted the Vergecast fixture had
        // no durations at all. Wrong: that feed publishes them under the
        // generated prefix <ns1:duration>, and ns1 IS the iTunes DTD namespace
        // — http://www.itunes.com/dtds/podcast-1.0.dtd. The rss crate matches
        // by namespace, not by prefix, so those parse correctly and the test
        // failed once the wiring landed. The premise was mine, not the code's.)
        const MIXED: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Mixed Durations</title>
    <link>https://example.org/</link>
    <description>one item with a duration, one without</description>
    <item>
      <title>Has a duration</title>
      <guid>with-duration</guid>
      <itunes:duration>00:10:00</itunes:duration>
    </item>
    <item>
      <title>Has none</title>
      <guid>without-duration</guid>
    </item>
  </channel>
</rss>"#;
        let data = PodcastManager::parse_rss(MIXED).expect("parse mixed fixture");
        assert_eq!(data.episodes.len(), 2, "both items parse");
        assert_eq!(data.episodes[0].duration_seconds, Some(600));
        assert_eq!(
            data.episodes[1].duration_seconds, None,
            "an absent itunes:duration must stay None, not borrow its sibling's"
        );
    }

    #[test]
    fn parse_duration_handles_every_itunes_shape() {
        // Feeds publish HH:MM:SS, MM:SS or bare seconds.
        assert_eq!(parse_duration("00:33:23"), Some(2003));
        assert_eq!(parse_duration("33:23"), Some(2003));
        assert_eq!(parse_duration("2003"), Some(2003));
        assert_eq!(parse_duration("1:02:21"), Some(3741));
        // Junk is None, never a panic or a zero that would look like "seekable
        // at 0".
        assert_eq!(parse_duration(""), None);
        assert_eq!(parse_duration("nonsense"), None);
        assert_eq!(parse_duration("1:2:3:4"), None);
    }

    // ---- RSS2-R-2: cover art ----
    // Live-test 2026-10-27: "the headphone icon works now, but I know these
    // podcasts normally should have real cover images, we need those displayed
    // there". Measured: 0 of 1,102 of the owner's podcast episodes had any
    // thumbnail_url, because parse_rss hard-coded None with a comment claiming
    // "channel.itunes_image not available" — false; the rss crate exposes
    // itunes_ext().image() on both the channel and every item.

    #[test]
    fn parse_reads_channel_itunes_image() {
        let data = PodcastManager::parse_rss(SOME_MORE_NEWS_FEED).expect("parse feed");
        let thumb = data
            .thumbnail_url
            .as_deref()
            .expect("the channel publishes <itunes:image>");
        assert!(thumb.starts_with("http"), "a real URL, not a placeholder: {thumb}");
        // Every episode carries SOME art — its own or the channel's — so the
        // card never has to fall back to the headphones icon for a feed that
        // publishes cover art.
        assert!(
            data.episodes.iter().all(|e| e.thumbnail_url.is_some()),
            "every episode of an art-publishing feed must carry art"
        );
    }

    #[test]
    fn an_item_without_its_own_image_inherits_the_channel_image() {
        // Inline fixture: the channel publishes art, the SECOND item publishes
        // none. That item must inherit the channel's image rather than showing
        // the headphones fallback beside its art-carrying sibling.
        const MIXED: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Art Test</title>
    <link>https://example.org/</link>
    <description>one item with art, one without</description>
    <itunes:image href="https://example.org/show-art.png"/>
    <item>
      <title>Has its own art</title>
      <guid>with-art</guid>
      <itunes:image href="https://example.org/episode-art.png"/>
    </item>
    <item>
      <title>Has none</title>
      <guid>without-art</guid>
    </item>
  </channel>
</rss>"#;
        let data = PodcastManager::parse_rss(MIXED).expect("parse mixed fixture");
        let channel_art = data.thumbnail_url.as_deref().expect("channel art");
        assert_eq!(channel_art, "https://example.org/show-art.png");

        assert_eq!(
            data.episodes[0].thumbnail_url.as_deref(),
            Some("https://example.org/episode-art.png"),
            "an item's OWN art wins over the channel's"
        );
        assert_eq!(
            data.episodes[1].thumbnail_url.as_deref(),
            Some("https://example.org/show-art.png"),
            "an item without its own art inherits the channel's"
        );
    }

    #[test]
    fn a_feed_with_no_art_anywhere_keeps_the_headphones_fallback() {
        // Review Focus 5: nothing invented. A feed publishing no image anywhere
        // must yield no image, so the UI can show its headphones fallback rather
        // than a broken img.
        //
        // Inline fixture on purpose: every committed real feed DOES publish art
        // — Vergecast carries it under <ns1:image> (ns1 is the iTunes DTD, so
        // the crate resolves it) AND in a plain RSS <image>. Asserting "no art"
        // against a real feed asserts a false premise; the first version of this
        // test did exactly that and failed once the wiring landed.
        const BARE: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>No Art Anywhere</title>
    <link>https://example.org/</link>
    <description>a feed that publishes no image</description>
    <item>
      <title>An episode</title>
      <guid>no-art-ep</guid>
    </item>
  </channel>
</rss>"#;
        let data = PodcastManager::parse_rss(BARE).expect("parse bare feed");
        assert!(data.thumbnail_url.is_none(), "no channel art");
        assert!(
            data.episodes.iter().all(|e| e.thumbnail_url.is_none()),
            "no episode art either — the UI must fall back, and must not invent one"
        );
    }

    // ---- LIVE smoke (network-dependent; #[ignore] keeps CI offline) --------
    // Run explicitly: cargo test --lib -- --ignored

    #[tokio::test]
    #[ignore = "live network: itunes.apple.com"]
    async fn live_itunes_search_returns_parseable_results() {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(20))
            .build()
            .expect("client");
        let resp = client
            .get("https://itunes.apple.com/search")
            .query(&[("term", "vergecast"), ("media", "podcast"), ("limit", "5")])
            .send()
            .await
            .expect("live request");
        assert!(resp.status().is_success(), "status {}", resp.status());
        let results =
            parse_itunes_search(&resp.text().await.expect("body")).expect("parse live");
        assert!(!results.is_empty(), "live iTunes search returned no results");
        assert!(
            results.iter().all(|r| r.feed_url.starts_with("http")),
            "every result carries a subscribable feed URL"
        );
        println!(
            "LIVE itunes: {} results; first: {} ({})",
            results.len(),
            results[0].title,
            results[0].feed_url
        );
    }

    // ---- 1e: concurrent refresh of due feeds ----
    // The 1c deferral: refresh fetched due feeds one at a time. The RED
    // assertion is STRUCTURAL (max observed in-flight fetches), so it fails
    // against sequential code on any machine, at any speed, with zero
    // network and zero wall-clock sensitivity: the injected closure sleeps
    // while holding an in-flight slot, and sequential code can never exceed
    // one.

    #[allow(clippy::too_many_arguments)]
    async fn refresh_test_pool() -> (sqlx::SqlitePool, PodcastManager) {
        // A real temp-file DB, not :memory:: each pool connection gets its
        // OWN private :memory: database (the trap fresh_pool's comment
        // documents), so concurrent refresh futures would hit empty schemas.
        // A file DB is also the honest emulation of production (WAL, one
        // writer at a time). Left for the OS to clean up.
        let dir = std::env::temp_dir().join(format!(
            "echoprism-refresh-test-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        let url = format!("sqlite://{}/test.db?mode=rwc", dir.display());
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(5)
            .connect(&url)
            .await
            .expect("connect temp-file sqlite");
        crate::db::migrations::run(&pool).await.expect("run migrations");
        sqlx::query("INSERT OR IGNORE INTO users (id) VALUES ('current-user')")
            .execute(&pool)
            .await
            .expect("insert user");
        let db = std::sync::Arc::new(crate::db::Database::from_pool(pool.clone()));
        let manager = PodcastManager {
            client: reqwest::Client::new(),
            db,
        };
        (pool, manager)
    }

    fn fixture_feed_data() -> PodcastFeedData {
        const FEED: &str = include_str!("fixtures/vergecast_feed.xml");
        PodcastManager::parse_rss(FEED).expect("parse vergecast fixture")
    }

    #[tokio::test]
    async fn refresh_overlaps_fetches_up_to_cap() {
        let (pool, manager) = refresh_test_pool().await;
        let due: Vec<(String, String)> = (0..4)
            .map(|i| (format!("https://feeds.example.org/feed-{i}.xml"), format!("Feed {i}")))
            .collect();

        let in_flight = std::sync::atomic::AtomicI64::new(0);
        let max_in_flight = std::sync::atomic::AtomicI64::new(0);
        // Borrow the counters into the closure (async move would move them
        // out on first call, making the closure FnOnce).
        let in_flight = &in_flight;
        let max_in_flight = &max_in_flight;
        let fetch = |_url: String| {
            in_flight.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            max_in_flight.fetch_max(
                in_flight.load(std::sync::atomic::Ordering::SeqCst),
                std::sync::atomic::Ordering::SeqCst,
            );
            async move {
                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                in_flight.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
                Ok(fixture_feed_data())
            }
        };

        let refreshed = manager
            .refresh_due_feeds_with(&due, fetch)
            .await
            .expect("refresh");

        assert_eq!(refreshed, 4, "every feed must refresh");
        let max = max_in_flight.load(std::sync::atomic::Ordering::SeqCst);
        assert_eq!(
            max, 4,
            "all 4 fetches must overlap (sequential code can never exceed 1)"
        );
        // Semantics pinned under concurrency: rows stored, every feed touched.
        let channels: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM channels")
            .fetch_one(&pool)
            .await
            .expect("count channels");
        assert_eq!(channels, 4, "one channel row per feed");
        let touched: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM podcast_feeds WHERE last_fetched_at IS NOT NULL",
        )
        .fetch_one(&pool)
        .await
        .expect("count touched feeds");
        assert_eq!(touched, 4, "every feed's last_fetched_at must be set");
        pool.close().await;
    }

    #[tokio::test]
    async fn failing_feed_does_not_block_or_count_others() {
        let (pool, manager) = refresh_test_pool().await;
        let due = vec![
            ("https://feeds.example.org/broken.xml".to_string(), "Broken".to_string()),
            ("https://feeds.example.org/works.xml".to_string(), "Works".to_string()),
        ];

        let fetch = |url: String| async move {
            if url.contains("broken") {
                Err("boom".to_string())
            } else {
                Ok(fixture_feed_data())
            }
        };

        let refreshed = manager
            .refresh_due_feeds_with(&due, fetch)
            .await
            .expect("refresh");

        assert_eq!(refreshed, 1, "only the successful feed counts");
        let broken_touched: Option<String> = sqlx::query_scalar(
            "SELECT last_fetched_at FROM podcast_feeds WHERE feed_url LIKE '%broken%'",
        )
        .fetch_optional(&pool)
        .await
        .expect("query broken feed");
        // The broken feed never made it into podcast_feeds (upsert happens
        // only after a successful fetch) — it stays due for the next cycle.
        assert!(broken_touched.is_none(), "failed feed must stay due");
        pool.close().await;
    }

    // --- Phase 3: YouTube subscription import ---

    /// The Invidious /api/v1/subscriptions shape: authorId is the channel's
    /// external id and the natural dedupe key.
    fn subs_fixture() -> Vec<YoutubeSubscription> {
        vec![
            YoutubeSubscription {
                author: "Some More News".into(),
                author_id: "UC-mock-smn".into(),
                author_url: "https://youtube.com/channel/UC-mock-smn".into(),
                author_thumbnails: vec![Thumbnail {
                    url: "https://example/smn.jpg".into(),
                    width: 100,
                    height: 100,
                }],
                subscriber_count: 42,
            },
            YoutubeSubscription {
                author: "Even More News".into(),
                author_id: "UC-mock-emn".into(),
                author_url: "https://youtube.com/channel/UC-mock-emn".into(),
                author_thumbnails: vec![],
                subscriber_count: 7,
            },
        ]
    }

    /// The pure seam: a Channel built from a subscription, WITHOUT touching the
    /// DB. Tested directly so the mapping is pinned offline, the way
    /// search_itunes_with factors the iTunes path.
    #[test]
    fn channel_from_subscription_maps_the_external_id_and_marks_it_subscribed() {
        let ch = channel_from_subscription(&subs_fixture()[0]);
        assert_eq!(ch.external_id, "UC-mock-smn", "author_id is the dedupe key");
        assert_eq!(ch.title, "Some More News");
        assert!(ch.is_subscribed, "an imported subscription IS a subscription");
        assert_eq!(ch.channel_type, crate::types::ChannelType::Video);
        assert_eq!(ch.handle.as_deref(), Some("https://youtube.com/channel/UC-mock-smn"));
        assert!(ch.thumbnail_url.is_some(), "the first thumbnail tier is used");
    }

    /// Discriminant for the stub: a subscription with no thumbnails must not
    /// panic or produce a broken row — `first()` on an empty vec is None.
    #[test]
    fn channel_from_subscription_tolerates_no_thumbnails() {
        let ch = channel_from_subscription(&subs_fixture()[1]);
        assert!(ch.thumbnail_url.is_none());
        assert_eq!(ch.subscriber_count, Some(7));
    }

    /// THE property the stub violated: a channel already present under the same
    /// external_id must NOT be inserted again, and the reported count must
    /// reflect reality rather than the loop.
    #[tokio::test]
    async fn import_skips_channels_already_subscribed() {
        let (pool, manager) = refresh_test_pool().await;
        // Seed one of the two subscriptions as an existing channel.
        let existing = channel_from_subscription(&subs_fixture()[0]);
        crate::db::queries::insert_channel(&pool, &existing)
            .await
            .expect("seed existing channel");

        let result = import_subscriptions(&manager, &subs_fixture())
            .await
            .expect("import");

        assert_eq!(
            result.imported, 1,
            "the duplicate is NOT counted — the stub reported 2 here"
        );
        assert_eq!(result.errors.len(), 0, "a skip is not an error");
        // And the survivor is really in the DB.
        let channels = crate::db::queries::list_channels(&pool, None)
            .await
            .expect("list");
        assert_eq!(channels.len(), 2, "one seeded + one newly imported");
    }

    /// The honest-count property end to end: the same import run twice imports
    /// nothing the second time.
    #[tokio::test]
    async fn importing_the_same_list_twice_imports_nothing_the_second_time() {
        let (_pool, manager) = refresh_test_pool().await;

        let first = import_subscriptions(&manager, &subs_fixture()).await.expect("first");
        assert_eq!(first.imported, 2);

        let second = import_subscriptions(&manager, &subs_fixture()).await.expect("second");
        assert_eq!(second.imported, 0, "idempotent on the external_id key");
        assert_eq!(second.errors.len(), 0);
    }
}
