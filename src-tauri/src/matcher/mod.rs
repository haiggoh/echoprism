//! Smart Episode Linking - matches podcast episodes to YouTube videos

use crate::types::*;
use crate::db::Database;
use crate::instance_pool::InstancePool;
use crate::extractor::Extractor;
use tauri::{AppHandle, Manager};
use std::sync::Arc;
use tokio::sync::RwLock;
use fuzzy_matcher::skim::SkimMatcherV2;
use fuzzy_matcher::FuzzyMatcher;
use levenshtein::levenshtein;
use stop_words::get;
use stop_words::LANGUAGE;
use std::collections::HashMap;
use chrono::{DateTime, Utc, Duration};
use tracing::{info, warn, debug};

#[derive(Clone)]
pub struct MatchingConfig {
    pub min_confidence: f64,
    pub title_weight: f64,
    pub date_weight: f64,
    pub duration_weight: f64,
    pub max_date_diff_days: i64,
    pub max_duration_diff_seconds: u64,
    pub min_title_similarity: f64,
}

impl Default for MatchingConfig {
    fn default() -> Self {
        Self {
            min_confidence: 0.7,
            title_weight: 0.6,
            date_weight: 0.2,
            duration_weight: 0.2,
            max_date_diff_days: 3,
            max_duration_diff_seconds: 60,
            min_title_similarity: 0.7,
        }
    }
}

pub struct EpisodeMatcher {
    db: Arc<Database>,
    pool: Arc<InstancePool>,
    extractor: Arc<Extractor>,
    fuzzy: fuzzy_matcher::skim::SkimMatcherV2,
    stop_words: std::collections::HashSet<String>,
    matching_config: MatchingConfig,
}

impl EpisodeMatcher {
    pub fn new(
        app_handle: AppHandle,
        config: Option<MatchingConfig>,
    ) -> Self {
        let pool = app_handle.state::<Arc<crate::instance_pool::InstancePool>>().inner().clone();
        let db = app_handle.state::<Arc<Database>>().inner().clone();
        let extractor = app_handle.state::<Arc<Extractor>>().inner().clone();

        let stop_words: std::collections::HashSet<String> = get(LANGUAGE::English).into_iter().collect();

        Self {
            db: db,
            pool: pool,
            extractor: extractor,
            fuzzy: fuzzy_matcher::skim::SkimMatcherV2::default(),
            stop_words,
            matching_config: config.unwrap_or_default(),
        }
    }
    
    /// Match all unlinked podcast episodes to YouTube videos
    pub async fn match_all(&self) -> Result<MatchResult, String> {
        let unmatched_podcasts = self.db.get_unmatched_podcasts().await?;
        let youtube_videos = self.db.get_youtube_videos().await?;
        
        let mut matched = 0;
        let mut errors: Vec<String> = Vec::new();
        
        for podcast in unmatched_podcasts {
            if let Some(link) = self.find_best_match(&podcast, &youtube_videos).await? {
                self.db.insert_episode_link(&link).await?;
                matched += 1;
            }
        }
        
        Ok(MatchResult { matched_count: matched })
    }
    
    /// Find best YouTube match for a podcast episode
    async fn find_best_match(
        &self,
        podcast: &PodcastEpisode,
        youtube_videos: &[YoutubeVideo],
    ) -> Result<Option<EpisodeLink>, String> {
        let mut best_match = None;
        let mut best_confidence = 0.0;
        
        for video in youtube_videos {
            let confidence = self.calculate_confidence(podcast, video).await?;
            
            if confidence > self.matching_config.min_confidence && confidence > best_confidence {
                best_confidence = confidence;
                let now = DateTimeUtc::from(chrono::Utc::now());
                best_match = Some(EpisodeLink {
                    id: uuid::Uuid::new_v4().to_string(),
                    podcast_guid: podcast.guid.clone(),
                    youtube_video_id: video.id.clone(),
                    confidence,
                    matched_at: now,
                    matched_by: MatchSource::Auto,
                    title_similarity: Some(self.title_similarity(&podcast.title, &video.title)),
                    date_diff_days: self.date_diff(podcast.published_at, video.published_at),
                    duration_diff_seconds: self.duration_diff(podcast.duration_seconds, video.duration_seconds),
                    user_confirmed: false,
                    created_at: now,
                    updated_at: now,
                });
            }
        }
        
        Ok(best_match)
    }
    
    /// Calculate match confidence between podcast and YouTube video
    async fn calculate_confidence(
        &self,
        podcast: &PodcastEpisode,
        video: &YoutubeVideo,
    ) -> Result<f64, String> {
        // Title similarity (using fuzzy matching)
        let title_sim = self.title_similarity(&podcast.title, &video.title);
        
        // Date proximity
        let date_score = self.date_score(podcast.published_at, video.published_at);
        
        // Duration similarity
        let duration_score = self.duration_score(
            podcast.duration_seconds.unwrap_or(0),
            video.duration_seconds.unwrap_or(0),
        );
        
        // Channel/author matching
        let channel_score = self.channel_similarity(&podcast.channel_title, &video.channel_title).await?;
        
        // TF-IDF content similarity (if transcripts available)
        let content_score = self.content_similarity(podcast, video).await?;
        
        // Weighted combination
        let confidence = 
            self.matching_config.title_weight * title_sim +
            self.matching_config.date_weight * date_score +
            self.matching_config.duration_weight * duration_score +
            0.1 * channel_score +
            0.1 * content_score;
        
        Ok(confidence.clamp(0.0, 1.0))
    }
    
    fn title_similarity(&self, title1: &str, title2: &str) -> f64 {
        let words1 = self.normalize_text(title1);
        let words2 = self.normalize_text(title2);
        
        if words1.is_empty() || words2.is_empty() {
            return 0.0;
        }
        
        // Fuzzy matching
        if let Some(score) = self.fuzzy.fuzzy_match(title1, title2) {
            return (score as f64 / title1.len().max(title2.len()) as f64).clamp(0.0, 1.0);
        }
        
        // Jaccard similarity of word sets
        let set1: std::collections::HashSet<_> = words1.into_iter().collect();
        let set2: std::collections::HashSet<_> = words2.into_iter().collect();
        let intersection = set1.intersection(&set2).count();
        let union = set1.union(&set2).count();
        
        if union == 0 { 0.0 } else { intersection as f64 / union as f64 }
    }
    
    fn normalize_text(&self, text: &str) -> Vec<String> {
        text.to_lowercase()
            .split_whitespace()
            .filter(|w| w.len() > 2 && self.stop_words.contains(*w))
            .map(|w| w.to_string())
            .collect()
    }
    
    fn date_score(&self, date1: Option<DateTimeUtc>, date2: Option<DateTimeUtc>) -> f64 {
        match (date1, date2) {
            (Some(d1), Some(d2)) => {
                let diff = (d1.inner() - d2.inner()).num_days().abs();
                if diff <= self.matching_config.max_date_diff_days {
                    1.0 - (diff as f64 / self.matching_config.max_date_diff_days as f64)
                } else {
                    0.0
                }
            }
            _ => 0.5, // Unknown dates get neutral score
        }
    }
    
    fn duration_score(&self, dur1: u64, dur2: u64) -> f64 {
        if dur1 == 0 || dur2 == 0 { return 0.5; }
        
        let diff = if dur1 > dur2 { dur1 - dur2 } else { dur2 - dur1 };
        if diff <= self.matching_config.max_duration_diff_seconds {
            1.0 - (diff as f64 / self.matching_config.max_duration_diff_seconds as f64)
        } else {
            0.0
        }
    }
    
    async fn channel_similarity(&self, ch1: &Option<String>, ch2: &Option<String>) -> Result<f64, String> {
        match (ch1, ch2) {
            (Some(c1), Some(c2)) => Ok(self.title_similarity(c1, c2)),
            _ => Ok(0.0),
        }
    }
    
    async fn content_similarity(&self, podcast: &PodcastEpisode, video: &YoutubeVideo) -> Result<f64, String> {
        // Could use TF-IDF on transcripts if available
        // For now, return neutral score
        Ok(0.5)
    }
    
    fn date_diff(&self, d1: Option<DateTimeUtc>, d2: Option<DateTimeUtc>) -> Option<i64> {
        match (d1, d2) {
            (Some(d1), Some(d2)) => Some((d1.inner() - d2.inner()).num_days()),
            _ => None,
        }
    }

    fn duration_diff(&self, d1: Option<u64>, d2: Option<u64>) -> Option<i64> {
        match (d1, d2) {
            (Some(d1), Some(d2)) => Some(if d1 > d2 { (d1 - d2) as i64 } else { (d2 - d1) as i64 }),
            _ => None,
        }
    }
}
