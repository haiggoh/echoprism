//! SponsorBlock integration for sponsor segment skipping

use crate::types::*;
use crate::db::Database;
use reqwest::Client;
use std::sync::Arc;
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use tracing::{info, warn, error};

pub struct SponsorBlockManager {
    client: reqwest::Client,
    db: Arc<Database>,
    cache: Arc<parking_lot::RwLock<HashMap<String, SponsorBlockCacheEntry>>>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct SponsorBlockCacheEntry {
    pub segments: Vec<SponsorSegment>,
    pub fetched_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

impl SponsorBlockManager {
    pub fn new(app_handle: tauri::AppHandle) -> Self {
        let db = app_handle.state::<crate::db::Database>().inner().clone();
        
        Self {
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .user_agent("EchoPrism/0.1 (https://github.com/echoprism/echoprism)")
                .build()
                .expect("Failed to create HTTP client"),
            db: Arc::new(app_handle.state::<crate::db::Database>().inner().clone()),
            cache: Arc::new(parking_lot::RwLock::new(HashMap::new())),
        }
    }
    
    /// Get sponsor segments for a video
    pub async fn get_segments(&self, video_id: &str) -> Result<Vec<SponsorSegment>, String> {
        // Check cache first
        {
            let cache = self.cache.read();
            if let Some(entry) = cache.get(video_id) {
                if entry.expires_at > chrono::Utc::now() {
                    return Ok(entry.segments.clone());
                }
            }
        }
        
        // Fetch from SponsorBlock API
        let segments = self.fetch_from_api(video_id).await?;
        
        // Cache the result (24 hours)
        let mut cache = self.cache.write();
        cache.insert(video_id.to_string(), SponsorBlockCacheEntry {
            segments: segments.clone(),
            fetched_at: chrono::Utc::now(),
            expires_at: chrono::Utc::now() + chrono::Duration::hours(24),
        });
        
        // Also save to database for persistence
        self.save_to_db(video_id, &segments).await?;
        
        Ok(segments)
    }
    
    async fn fetch_from_api(&self, video_id: &str) -> Result<Vec<SponsorSegment>, String> {
        let url = format!("https://sponsor.ajay.app/api/skipSegments?videoID={}&categories=sponsor,selfpromo,interaction,intro,outro,preview,poi_highlight,chapter", video_id);
        
        let response = reqwest::get(&url).await
            .map_err(|e| format!("Request failed: {}", e))?;
        
        if !response.status().is_success() {
            if response.status() == 404 {
                return Ok(vec![]); // No segments found
            }
            return Err(format!("SponsorBlock API error: {}", response.status()));
        }
        
        let segments: Vec<SponsorBlockSegment> = response.json().await
            .map_err(|e| format!("Failed to parse response: {}", e))?;
        
        // Filter and convert
        let segments: Vec<SponsorSegment> = segments
            .into_iter()
            .filter(|s| s.votes > 0) // Only segments with positive votes
            .map(|s| SponsorSegment {
                start_time: s.start_time,
                end_time: s.end_time,
                category: s.category.clone(),
                uuid: s.uuid.clone(),
                votes: s.votes,
            })
            .collect();
        
        Ok(segments)
    }
    
    async fn save_to_db(&self, video_id: &str, segments: &[SponsorSegment]) -> Result<(), String> {
        let segments_json = serde_json::to_string(segments)
            .map_err(|e| format!("Failed to serialize segments: {}", e))?;
        
        // Save to database with 24h expiry
        let expires_at = chrono::Utc::now() + chrono::Duration::hours(24);
        
        // self.db.save_sponsorblock_segments(video_id, &segments_json, expires_at).await?;
        Ok(())
    }
    
    /// Submit a new segment to SponsorBlock
    pub async fn submit_segment(
        &self,
        video_id: &str,
        start_time: f64,
        end_time: f64,
        category: String,
        user_id: String,
    ) -> Result<(), String> {
        let client = reqwest::Client::new();
        
        let params = serde_json::json!({
            "videoID": video_id,
            "startTime": start_time,
            "endTime": end_time,
            "category": category,
            "userID": user_id,
            "userName": "EchoPrism User",
            "service": "EchoPrism",
        });
        
        let response = reqwest::Client::new()
            .post("https://sponsor.ajay.app/api/skipSegments")
            .json(&serde_json::json!({
                "videoID": video_id,
                "startTime": start_time,
                "endTime": end_time,
                "category": category,
                "userID": "echoprism_user",
                "userName": "EchoPrism User",
                "service": "EchoPrism",
            }))
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;
        
        if !response.status().is_success() {
            return Err(format!("Failed to submit segment: {}", response.status()));
        }
        
        // Invalidate cache for this video
        {
            let mut cache = self.cache.write();
            cache.remove("video_id");
        }
        
        Ok(())
    }
    
    /// Get segments with user's category preferences applied
    pub async fn get_segments_filtered(
        &self,
        video_id: &str,
        user_categories: Vec<String>,
    ) -> Result<Vec<SponsorSegment>, String> {
        let all_segments = self.get_segments(video_id).await?;
        
        if user_categories.is_empty() {
            return Ok(vec![]);
        }
        
        Ok(all_segments.into_iter()
            .filter(|s| user_categories.contains(&s.category))
            .collect())
    }
    
    /// Clear cache for a video (e.g., after user submits correction)
    pub fn invalidate_cache(&self, video_id: &str) {
        let mut cache = self.cache.write();
        cache.remove(video_id);
    }
    
    /// Get cache stats
    pub fn cache_stats(&self) -> (usize, usize) {
        let cache = self.cache.read();
        (cache.len(), cache.capacity())
    }
}
