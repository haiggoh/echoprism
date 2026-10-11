//! Core types for EchoPrism

use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPreferences {
    pub user_id: String,
    pub default_instance_id: Option<String>,
    pub default_format: Format,
    pub queue_behavior: QueueBehavior,
    pub audio_only_default: bool,
    pub auto_download_wifi: bool,
    pub sponsorblock_enabled: bool,
    pub sponsorblock_categories: Vec<String>,
    pub keyboard_shortcuts_enabled: bool,
    pub theme: Theme,
    pub cross_device_sync_enabled: bool,
    pub updated_at: chrono::DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Format {
    Video,
    Audio,
    Unified,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum QueueBehavior {
    PlayNext,
    AddEnd,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Theme {
    Dark,
    Light,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Instance {
    pub id: String,
    pub url: String,
    pub instance_type: InstanceType,
    pub health: InstanceHealth,
    pub latency_ms: Option<u64>,
    pub last_checked: Option<chrono::DateTime<Utc>>,
    pub auto_failover: bool,
    pub supports_sabr: bool,
    pub supports_age_restricted: bool,
    pub region: Option<String>,
    pub country: Option<String>,
    pub pinned: bool,
    pub created_at: chrono::DateTime<Utc>,
    pub updated_at: chrono::DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum InstanceType {
    Invidious,
    Piped,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum InstanceHealth {
    Healthy,
    Degraded,
    Failed,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Channel {
    pub id: String,
    pub user_id: String,
    pub external_id: String,
    pub title: String,
    pub handle: Option<String>,
    pub thumbnail_url: Option<String>,
    pub description: Option<String>,
    pub subscriber_count: Option<u64>,
    pub is_subscribed: bool,
    pub subscribed_at: chrono::DateTime<Utc>,
    pub notifications_enabled: bool,
    pub format_preference: Format,
    pub instance_id: Option<String>,
    pub channel_type: ChannelType,
    pub podcast_feed_url: Option<String>,
    pub podcast_guid: Option<String>,
    pub last_fetched_at: Option<chrono::DateTime<Utc>>,
    pub created_at: chrono::DateTime<Utc>,
    pub updated_at: chrono::DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ChannelType {
    Video,
    Podcast,
    Both,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Episode {
    pub id: String,
    pub channel_id: String,
    pub external_id: String,
    pub title: String,
    pub description: Option<String>,
    pub thumbnail_url: Option<String>,
    pub duration_seconds: Option<u64>,
    pub published_at: Option<chrono::DateTime<Utc>>,
    pub url: Option<String>,
    pub video_id: Option<String>,
    pub podcast_guid: Option<String>,
    pub episode_number: Option<u32>,
    pub season_number: Option<u32>,
    pub audio_url: Option<String>,
    pub video_url: Option<String>,
    pub formats: Option<serde_json::Value>,
    pub chapters: Option<Vec<Chapter>>,
    pub sponsors: Option<Vec<SponsorSegment>>,
    pub transcript_url: Option<String>,
    pub is_downloaded: bool,
    pub download_quality: Option<String>,
    pub progress_seconds: f64,
    pub created_at: chrono::DateTime<Utc>,
    pub updated_at: chrono::DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chapter {
    pub start_time: f64,
    pub end_time: f64,
    pub title: String,
    pub image_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SponsorSegment {
    pub start_time: f64,
    pub end_time: f64,
    pub category: String,
    pub uuid: String,
    pub votes: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpisodeLink {
    pub id: String,
    pub podcast_guid: String,
    pub youtube_video_id: String,
    pub confidence: f64,
    pub matched_at: chrono::DateTime<Utc>,
    pub matched_by: MatchSource,
    pub title_similarity: Option<f64>,
    pub date_diff_days: Option<i64>,
    pub duration_diff_seconds: Option<i64>,
    pub user_confirmed: bool,
    pub created_at: chrono::DateTime<Utc>,
    pub updated_at: chrono::DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MatchSource {
    Auto,
    Manual,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Queue {
    pub id: String,
    pub user_id: String,
    pub current_index: usize,
    pub repeat_mode: RepeatMode,
    pub shuffle: bool,
    pub audio_only_mode: bool,
    pub created_at: chrono::DateTime<Utc>,
    pub updated_at: chrono::DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RepeatMode {
    Off,
    One,
    All,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueItem {
    pub id: String,
    pub queue_id: String,
    pub episode_id: String,
    pub position: usize,
    pub added_at: chrono::DateTime<Utc>,
    pub source: QueueSource,
    pub play_mode: PlayMode,
    pub smart_link_id: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum QueueSource {
    Feed,
    Search,
    Manual,
    History,
    SmartLink,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PlayMode {
    Video,
    Audio,
    Unified,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaybackState {
    pub user_id: String,
    pub episode_id: Option<String>,
    pub position_seconds: f64,
    pub duration_seconds: Option<f64>,
    pub playback_rate: f64,
    pub volume: f64,
    pub is_audio_mode: bool,
    pub is_pip: bool,
    pub current_instance_id: Option<String>,
    pub last_updated: chrono::DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Download {
    pub id: String,
    pub episode_id: String,
    pub quality: String,
    pub format: DownloadFormat,
    pub file_path: String,
    pub file_size: Option<u64>,
    pub status: DownloadStatus,
    pub progress: f64,
    pub error_message: Option<String>,
    pub created_at: chrono::DateTime<Utc>,
    pub completed_at: Option<chrono::DateTime<Utc>>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DownloadFormat {
    Video,
    Audio,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DownloadStatus {
    Pending,
    Downloading,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub user_id: String,
    pub episode_id: String,
    pub position_seconds: f64,
    duration_seconds: Option<f64>,
    pub completed: bool,
    pub played_at: chrono::DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PodcastFeed {
    pub id: String,
    pub user_id: String,
    pub feed_url: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub thumbnail_url: Option<String>,
    pub link: Option<String>,
    pub language: Option<String>,
    pub author: Option<String>,
    pub categories: Option<Vec<String>>,
    pub last_fetched_at: Option<chrono::DateTime<Utc>>,
    pub last_episode_published_at: Option<chrono::DateTime<Utc>>,
    pub fetch_interval_minutes: u64,
    pub auto_download: bool,
    pub is_active: bool,
    pub created_at: chrono::DateTime<Utc>,
    pub updated_at: chrono::DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SponsorBlockSegment {
    pub video_id: String,
    pub segments: Vec<SponsorSegment>,
    pub fetched_at: chrono::DateTime<Utc>,
    pub expires_at: chrono::DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SponsorSegment {
    pub start_time: f64,
    pub end_time: f64,
    pub category: String,
    pub uuid: String,
    pub votes: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyboardShortcut {
    pub id: String,
    pub user_id: String,
    pub action: String,
    pub key_combination: String,
    pub context: ShortcutContext,
    pub enabled: bool,
    pub is_custom: bool,
    pub created_at: chrono::DateTime<Utc>,
    pub updated_at: chrono::DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ShortcutContext {
    Global,
    Player,
    Queue,
    Feed,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DownloadFormat {
    Video,
    Audio,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DownloadStatus {
    Pending,
    Downloading,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PlayMode {
    Video,
    Audio,
    Unified,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RepeatMode {
    Off,
    One,
    All,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum QueueSource {
    Feed,
    Search,
    Manual,
    History,
    SmartLink,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PlayModeType {
    Video,
    Audio,
    Unified,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ShortcutContext {
    Global,
    Player,
    Queue,
    Feed,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum InstanceType {
    Invidious,
    Piped,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum InstanceHealth {
    Healthy,
    Degraded,
    Failed,
    Unknown,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ChannelType {
    Video,
    Podcast,
    Both,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Format {
    Video,
    Audio,
    Unified,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum QueueBehavior {
    PlayNext,
    AddEnd,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Theme {
    Dark,
    Light,
    System,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FormatType {
    Video,
    Audio,
    Unified,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MatchSource {
    Auto,
    Manual,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DownloadFormat {
    Video,
    Audio,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DownloadStatus {
    Pending,
    Downloading,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RepeatMode {
    Off,
    One,
    All,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum QueueSource {
    Feed,
    Search,
    Manual,
    History,
    SmartLink,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PlayMode {
    Video,
    Audio,
    Unified,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ShortcutContext {
    Global,
    Player,
    Queue,
    Feed,
}
