//! Podcast RSS/Atom/JSON Feed parser with OPML import/export

use crate::types::*;
use crate::db::Database;
use tauri::{AppHandle, Manager};
use reqwest::Client;
use std::sync::Arc;
use rss::Channel as RssChannel;
use serde::{Deserialize, Serialize};
use serde_json::Value;
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
        
        let mut episodes = Vec::new();
        for item in channel.items {
            let guid = item.guid.as_ref().map(|g| g.value.clone()).unwrap_or_else(|| {
                item.link.clone().unwrap_or_else(|| uuid::Uuid::new_v4().to_string())
            });
            
            episodes.push(PodcastEpisode {
                id: uuid::Uuid::new_v4().to_string(),
                guid,
                title: item.title.unwrap_or_default(),
                description: item.description,
                channel_title: Some(channel.title.clone()),
                channel_id: None,
                published_at: item.pub_date.as_ref().and_then(|d| DateTime::parse_from_rfc2822(d).ok().map(|dt| DateTimeUtc(dt.with_timezone(&Utc)))),
                duration_seconds: None,
                audio_url: item.enclosure.as_ref().map(|e| e.url.clone()),
                transcript: None,
            });
        }
        
        Ok(PodcastFeedData {
            title: channel.title,
            description: Some(channel.description),
            link: Some(channel.link),
            language: channel.language,
            author: None, // channel.itunes_author not available
            categories: channel.categories.iter().map(|c| c.name.clone()).collect(),
            thumbnail_url: None, // channel.itunes_image not available
            episodes,
        })
    }
    
    fn parse_json_feed(content: &str) -> Result<PodcastFeedData, String> {
        let value: Value = serde_json::from_str(content)
            .map_err(|e| format!("Failed to parse JSON Feed: {}", e))?;
        
        let mut episodes = Vec::new();
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
            thumbnail_url: value.get("icon").or_else(|| value.get("favicon")).and_then(|v| v.as_str()).map(|s| s.to_string()),
            episodes,
        })
    }
    
    /// Import subscriptions from OPML.
    ///
    /// Unwired future feature: the roadmap names OPML import/export as
    /// existing-but-unused (step 1c delivered the iTunes directory instead),
    /// and channels::import/export are its registered stub entry points.
    /// Its persistence half, save_podcast_feed, must call the 1c
    /// upsert_podcast_subscription when this gets wired.
    #[allow(dead_code)]
    pub async fn import_opml(&self, opml_content: &str) -> Result<ImportResult, String> {
        let doc = roxmltree::Document::parse(opml_content)
            .map_err(|e| format!("Failed to parse OPML: {}", e))?;
        
        let mut imported = 0;
        let mut errors = Vec::new();
        
        for node in doc.descendants().filter(|n| n.tag_name().name() == "outline") {
            if let Some(xml_url) = node.attribute("xmlUrl") {
                let feed_url = xml_url.to_string();
                let title = node.attribute("title").or(node.attribute("text")).unwrap_or("Unknown").to_string();
                
                match self.fetch_feed(&feed_url).await {
                    Ok(feed_data) => {
                        // Save feed to database
                        if let Err(e) = self.save_podcast_feed(&feed_url, title, feed_data).await {
                            errors.push(format!("Failed to save {}: {}", feed_url, e));
                        } else {
                            imported += 1;
                        }
                    }
                    Err(e) => {
                        errors.push(format!("Failed to fetch {}: {}", feed_url, e));
                    }
                }
            }
        }
        
        Ok(ImportResult { imported, errors })
    }
    
    /// Persistence half of import_opml (kept with it, see import_opml); its
    /// inserts are still commented out and must become a call to the 1c
    /// upsert_podcast_subscription when OPML import gets wired.
    #[allow(dead_code)]
    async fn save_podcast_feed(&self, feed_url: &str, title: String, feed_data: PodcastFeedData) -> Result<(), String> {
        // Save podcast feed to database
        let _feed = PodcastFeed {
            id: uuid::Uuid::new_v4().to_string(),
            user_id: "current-user".to_string(),
            feed_url: feed_url.to_string(),
            title: Some(title),
            description: feed_data.description,
            thumbnail_url: feed_data.thumbnail_url,
            link: feed_data.link,
            language: feed_data.language,
            author: feed_data.author,
            categories: Some(feed_data.categories),
            last_fetched_at: Some(DateTimeUtc::from(chrono::Utc::now())),
            last_episode_published_at: None,
            fetch_interval_minutes: 60,
            auto_download: false,
            is_active: true,
            created_at: DateTimeUtc::from(chrono::Utc::now()),
            updated_at: DateTimeUtc::from(chrono::Utc::now()),
        };
        
        // Insert into database
        // self.db.insert_podcast_feed(&feed).await?;
        
        // Insert episodes
        for _episode in feed_data.episodes {
            // self.db.insert_episode(&episode).await?;
        }
        
        Ok(())
    }
    
    /// Export subscriptions to OPML.
    ///
    /// Unwired future feature, kept with import_opml — see the roadmap note
    /// there. `channels::export` is its registered stub entry point.
    #[allow(dead_code)]
    pub async fn export_opml(&self) -> Result<String, String> {
        // Generate OPML from database
        Ok("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<opml version=\"2.0\">\n  <head><title>EchoPrism Subscriptions</title></head>\n  <body></body>\n</opml>".to_string())
    }
    
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
        let mut refreshed = 0usize;
        for (feed_url, stored_title) in due {
            match self.fetch_feed(&feed_url).await {
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

    /// Import subscriptions from YouTube (via Invidious instance)
    /// Unwired future feature: import YouTube-channel subscriptions via an
    /// Invidious-compatible subscriptions endpoint, kept for the
    /// video-channel subscribe step (see Database::insert_channel).
    #[allow(dead_code)]
    pub async fn import_from_youtube(&self, instance_url: &str) -> Result<ImportResult, String> {
        // Fetch subscriptions from Invidious instance
        let url = format!("{}/api/v1/subscriptions", instance_url.trim_end_matches('/'));
        
        let response = reqwest::get(&url).await
            .map_err(|e| format!("Request failed: {}", e))?;
        
        if !response.status().is_success() {
            return Err("Failed to fetch subscriptions".to_string());
        }
        
        let subscriptions: Vec<YoutubeSubscription> = response.json().await
            .map_err(|e| format!("Failed to parse subscriptions: {}", e))?;
        
        let mut imported = 0;
        let errors = Vec::new();
        
        for sub in subscriptions {
            // Add as channel
            let now = chrono::Utc::now().to_rfc3339();
            let _channel = crate::types::Channel {
                id: uuid::Uuid::new_v4().to_string(),
                user_id: "current-user".to_string(),
                external_id: sub.author_id.clone(),
                title: sub.author.clone(),
                handle: Some(sub.author_url.clone()),
                thumbnail_url: sub.author_thumbnails.first().map(|t| t.url.clone()),
                description: None,
                subscriber_count: Some(sub.subscriber_count as i64),
                is_subscribed: true,
                subscribed_at: now.clone(),
                notifications_enabled: true,
                format_preference: crate::types::Format::Both,
                instance_id: None,
                channel_type: crate::types::ChannelType::Video,
                podcast_feed_url: None,
                podcast_guid: None,
                last_fetched_at: None,
                created_at: now.clone(),
                updated_at: now,
            };
            
            // Insert into database
            // self.db.insert_channel(&channel).await?;
            imported += 1;
        }
        
        Ok(ImportResult { imported, errors })
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

/// Reserved for itunes:duration parsing: feeds publish `<itunes:duration>`
/// (seen in the Even More News fixture) but parse_rss ignores it today, so
/// podcast durations are always None and the matcher's duration signal sits
/// at neutral. Wiring this in is the recorded 1d future work.
#[allow(dead_code)]
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
}
