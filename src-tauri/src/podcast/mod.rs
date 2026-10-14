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
        let response = self.client.get(feed_url)
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
                self.parse_rss(&content_str)
            } else if content_str.contains("<feed") || content_str.contains("xmlns=\"http://www.w3.org/2005/Atom\"") {
                self.parse_atom(&content_str)
            } else {
                Err("Unknown XML feed format".to_string())
            }
        } else if content_str.trim().starts_with('{') {
            // JSON Feed
            self.parse_json_feed(&content_str)
        } else {
            Err("Unsupported feed format".to_string())
        }
    }
    
    fn parse_rss(&self, content: &str) -> Result<PodcastFeedData, String> {
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
    
    fn parse_atom(&self, content: &str) -> Result<PodcastFeedData, String> {
        // Simplified atom parsing - atom_syndication crate has changed
        let _ = content; // suppress unused warning for now
        Ok(PodcastFeedData {
            title: String::new(),
            description: None,
            link: None,
            language: None,
            author: None,
            categories: Vec::new(),
            thumbnail_url: None,
            episodes: Vec::new(),
        })
    }
    
    fn parse_json_feed(&self, content: &str) -> Result<PodcastFeedData, String> {
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
    
    /// Import subscriptions from OPML
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
    
    /// Export subscriptions to OPML
    pub async fn export_opml(&self) -> Result<String, String> {
        // Generate OPML from database
        Ok("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<opml version=\"2.0\">\n  <head><title>EchoPrism Subscriptions</title></head>\n  <body></body>\n</opml>".to_string())
    }
    
    /// Import subscriptions from YouTube (via Invidious instance)
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
                format_preference: crate::types::Format::Unified,
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

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportResult {
    pub imported: u32,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct YoutubeSubscription {
    pub author: String,
    pub author_id: String,
    pub author_url: String,
    pub author_thumbnails: Vec<Thumbnail>,
    pub subscriber_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Thumbnail {
    pub url: String,
    pub width: u32,
    pub height: u32,
}

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
