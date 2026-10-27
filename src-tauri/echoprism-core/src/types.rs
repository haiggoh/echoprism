//! Core types for EchoPrism

use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use std::str::FromStr;

// Helper type for DateTimeUtc stored as TEXT (RFC3339)
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub struct DateTimeUtc(pub DateTime<Utc>);

impl DateTimeUtc {
    pub fn new(dt: DateTime<Utc>) -> Self {
        Self(dt)
    }

    pub fn inner(&self) -> DateTime<Utc> {
        self.0
    }

    pub fn to_rfc3339(&self) -> String {
        self.0.to_rfc3339()
    }
}

impl From<DateTime<Utc>> for DateTimeUtc {
    fn from(dt: DateTime<Utc>) -> Self {
        Self(dt)
    }
}

impl From<DateTimeUtc> for DateTime<Utc> {
    fn from(dt: DateTimeUtc) -> Self {
        dt.0
    }
}

impl From<String> for DateTimeUtc {
    fn from(s: String) -> Self {
        DateTime::parse_from_rfc3339(&s)
            .map(|dt| DateTimeUtc(dt.with_timezone(&Utc)))
            .unwrap_or_else(|_| DateTimeUtc(DateTime::default()))
    }
}

impl From<&str> for DateTimeUtc {
    fn from(s: &str) -> Self {
        DateTime::parse_from_rfc3339(s)
            .map(|dt| DateTimeUtc(dt.with_timezone(&Utc)))
            .unwrap_or_else(|_| DateTimeUtc(DateTime::default()))
    }
}

impl sqlx::Decode<'_, sqlx::Sqlite> for DateTimeUtc {
    fn decode(value: sqlx::sqlite::SqliteValueRef<'_>) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let s = <&str as sqlx::Decode<'_, sqlx::Sqlite>>::decode(value)?;
        DateTime::parse_from_rfc3339(s)
            .map(|dt| DateTimeUtc(dt.with_timezone(&Utc)))
            .map_err(|e| e.into())
    }
}

impl sqlx::Encode<'_, sqlx::Sqlite> for DateTimeUtc {
    fn encode_by_ref(&self, buf: &mut Vec<sqlx::sqlite::SqliteArgumentValue<'_>>) -> sqlx::encode::IsNull {
        let s: String = self.0.to_rfc3339();
        <String as sqlx::Encode<'_, sqlx::Sqlite>>::encode(s, buf)
    }
}

// Manual sqlx::Type implementation for DateTimeUtc
impl sqlx::Type<sqlx::Sqlite> for DateTimeUtc {
    fn type_info() -> sqlx::sqlite::SqliteTypeInfo {
        <String as sqlx::Type<sqlx::Sqlite>>::type_info()
    }
}










#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: String,
    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, strum::Display, strum::EnumString, Default)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum CardClickAction {
    /// Context-aware: play now when nothing is playing, queue when media is active.
    #[default]
    Auto,
    PlayNow,
    LoadPaused,
    Queue,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
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
    #[serde(default)]
    pub card_click_action: CardClickAction,
    pub updated_at: DateTimeUtc,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, strum::Display, strum::EnumString)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum Format {
    Video,
    Audio,
    Unified,
    /// Channel-level "plays both streams, no default" preference. The
    /// channels table's domain is video/audio/both (schema CHECK) while
    /// user preferences use unified/video/audio — one enum serves both,
    /// so `Both` exists for the channel rows (schema default 'both').
    Both,
}

impl sqlx::Decode<'_, sqlx::Sqlite> for Format {
    fn decode(value: sqlx::sqlite::SqliteValueRef<'_>) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let s = <&str as sqlx::Decode<'_, sqlx::Sqlite>>::decode(value)?;
        s.parse().map_err(|_| format!("Invalid Format: {}", s).into())
    }
}

impl sqlx::Encode<'_, sqlx::Sqlite> for Format {
    fn encode_by_ref(&self, buf: &mut Vec<sqlx::sqlite::SqliteArgumentValue<'_>>) -> sqlx::encode::IsNull {
        let s: String = self.to_string();
        <String as sqlx::Encode<'_, sqlx::Sqlite>>::encode(s, buf)
    }
}

impl sqlx::Type<sqlx::Sqlite> for Format {
    fn type_info() -> sqlx::sqlite::SqliteTypeInfo {
        <String as sqlx::Type<sqlx::Sqlite>>::type_info()
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, strum::Display, strum::EnumString)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum QueueBehavior {
    PlayNext,
    AddEnd,
}

impl sqlx::Decode<'_, sqlx::Sqlite> for QueueBehavior {
    fn decode(value: sqlx::sqlite::SqliteValueRef<'_>) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let s = <&str as sqlx::Decode<'_, sqlx::Sqlite>>::decode(value)?;
        s.parse().map_err(|_| format!("Invalid QueueBehavior: {}", s).into())
    }
}

impl sqlx::Encode<'_, sqlx::Sqlite> for QueueBehavior {
    fn encode_by_ref(&self, buf: &mut Vec<sqlx::sqlite::SqliteArgumentValue<'_>>) -> sqlx::encode::IsNull {
        let s: String = self.to_string();
        <String as sqlx::Encode<'_, sqlx::Sqlite>>::encode(s, buf)
    }
}

impl sqlx::Type<sqlx::Sqlite> for QueueBehavior {
    fn type_info() -> sqlx::sqlite::SqliteTypeInfo {
        <String as sqlx::Type<sqlx::Sqlite>>::type_info()
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, strum::Display, strum::EnumString)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum Theme {
    Dark,
    Light,
    System,
}

impl sqlx::Decode<'_, sqlx::Sqlite> for Theme {
    fn decode(value: sqlx::sqlite::SqliteValueRef<'_>) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let s = <&str as sqlx::Decode<'_, sqlx::Sqlite>>::decode(value)?;
        s.parse().map_err(|_| format!("Invalid Theme: {}", s).into())
    }
}

impl sqlx::Encode<'_, sqlx::Sqlite> for Theme {
    fn encode_by_ref(&self, buf: &mut Vec<sqlx::sqlite::SqliteArgumentValue<'_>>) -> sqlx::encode::IsNull {
        let s: String = self.to_string();
        <String as sqlx::Encode<'_, sqlx::Sqlite>>::encode(s, buf)
    }
}

impl sqlx::Type<sqlx::Sqlite> for Theme {
    fn type_info() -> sqlx::sqlite::SqliteTypeInfo {
        <String as sqlx::Type<sqlx::Sqlite>>::type_info()
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, strum::Display, strum::EnumString)]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "snake_case")]
pub enum InstanceType {
    Invidious,
    Piped,
}

impl sqlx::Decode<'_, sqlx::Sqlite> for InstanceType {
    fn decode(value: sqlx::sqlite::SqliteValueRef<'_>) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let s = <&str as sqlx::Decode<'_, sqlx::Sqlite>>::decode(value)?;
        s.parse().map_err(|_| format!("Invalid InstanceType: {}", s).into())
    }
}

impl sqlx::Encode<'_, sqlx::Sqlite> for InstanceType {
    fn encode_by_ref(&self, buf: &mut Vec<sqlx::sqlite::SqliteArgumentValue<'_>>) -> sqlx::encode::IsNull {
        let s: String = self.to_string();
        <String as sqlx::Encode<'_, sqlx::Sqlite>>::encode(s, buf)
    }
}

impl sqlx::Type<sqlx::Sqlite> for InstanceType {
    fn type_info() -> sqlx::sqlite::SqliteTypeInfo {
        <String as sqlx::Type<sqlx::Sqlite>>::type_info()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Instance {
    pub id: String,
    pub url: String,
    pub instance_type: InstanceType,
    pub health: InstanceHealth,
    pub latency_ms: Option<i64>,
    pub last_checked: Option<String>,
    pub auto_failover: bool,
    pub supports_sabr: bool,
    pub supports_age_restricted: bool,
    pub region: Option<String>,
    pub country: Option<String>,
    pub pinned: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, strum::Display, strum::EnumString)]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "snake_case")]
pub enum InstanceHealth {
    Healthy,
    Degraded,
    Failed,
    Unknown,
}

impl sqlx::Decode<'_, sqlx::Sqlite> for InstanceHealth {
    fn decode(value: sqlx::sqlite::SqliteValueRef<'_>) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let s = <&str as sqlx::Decode<'_, sqlx::Sqlite>>::decode(value)?;
        s.parse().map_err(|_| format!("Invalid InstanceHealth: {}", s).into())
    }
}

impl sqlx::Encode<'_, sqlx::Sqlite> for InstanceHealth {
    fn encode_by_ref(&self, buf: &mut Vec<sqlx::sqlite::SqliteArgumentValue<'_>>) -> sqlx::encode::IsNull {
        let s: String = self.to_string();
        <String as sqlx::Encode<'_, sqlx::Sqlite>>::encode(s, buf)
    }
}

impl sqlx::Type<sqlx::Sqlite> for InstanceHealth {
    fn type_info() -> sqlx::sqlite::SqliteTypeInfo {
        <String as sqlx::Type<sqlx::Sqlite>>::type_info()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Channel {
    pub id: String,
    pub user_id: String,
    pub external_id: String,
    pub title: String,
    pub handle: Option<String>,
    pub thumbnail_url: Option<String>,
    pub description: Option<String>,
    pub subscriber_count: Option<i64>,
    pub is_subscribed: bool,
    pub subscribed_at: String,
    pub notifications_enabled: bool,
    pub format_preference: Format,
    pub instance_id: Option<String>,
    /// Wire name `type` matches the TS `Channel.type` interface (and the
    /// inbound `ChannelListParams` rename); the DB column stays `channel_type`
    /// — sqlx::FromRow keys on the field name, not the serde rename.
    #[serde(rename = "type")]
    pub channel_type: ChannelType,
    pub podcast_feed_url: Option<String>,
    pub podcast_guid: Option<String>,
    pub last_fetched_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, strum::Display, strum::EnumString)]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "snake_case")]
pub enum ChannelType {
    Video,
    Podcast,
    Both,
}

impl sqlx::Decode<'_, sqlx::Sqlite> for ChannelType {
    fn decode(value: sqlx::sqlite::SqliteValueRef<'_>) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let s = <&str as sqlx::Decode<'_, sqlx::Sqlite>>::decode(value)?;
        s.parse().map_err(|_| format!("Invalid ChannelType: {}", s).into())
    }
}

impl sqlx::Encode<'_, sqlx::Sqlite> for ChannelType {
    fn encode_by_ref(&self, buf: &mut Vec<sqlx::sqlite::SqliteArgumentValue<'_>>) -> sqlx::encode::IsNull {
        let s: String = self.to_string();
        <String as sqlx::Encode<'_, sqlx::Sqlite>>::encode(s, buf)
    }
}

impl sqlx::Type<sqlx::Sqlite> for ChannelType {
    fn type_info() -> sqlx::sqlite::SqliteTypeInfo {
        <String as sqlx::Type<sqlx::Sqlite>>::type_info()
    }
}

// Only implement From<String>, not From<&str> to avoid TryFrom conflict with strum::EnumString
impl From<String> for ChannelType {
    fn from(s: String) -> Self {
        ChannelType::from_str(&s).unwrap_or(ChannelType::Video)
    }
}

impl From<String> for Format {
    fn from(s: String) -> Self {
        Format::from_str(&s).unwrap_or(Format::Unified)
    }
}

impl From<String> for QueueBehavior {
    fn from(s: String) -> Self {
        QueueBehavior::from_str(&s).unwrap_or(QueueBehavior::AddEnd)
    }
}

impl From<String> for Theme {
    fn from(s: String) -> Self {
        Theme::from_str(&s).unwrap_or(Theme::System)
    }
}

impl From<String> for InstanceType {
    fn from(s: String) -> Self {
        InstanceType::from_str(&s).unwrap_or(InstanceType::Piped)
    }
}

impl From<String> for InstanceHealth {
    fn from(s: String) -> Self {
        InstanceHealth::from_str(&s).unwrap_or(InstanceHealth::Unknown)
    }
}

impl From<String> for DownloadFormat {
    fn from(s: String) -> Self {
        DownloadFormat::from_str(&s).unwrap_or(DownloadFormat::Video)
    }
}

impl From<String> for DownloadStatus {
    fn from(s: String) -> Self {
        DownloadStatus::from_str(&s).unwrap_or(DownloadStatus::Pending)
    }
}

impl From<String> for RepeatMode {
    fn from(s: String) -> Self {
        RepeatMode::from_str(&s).unwrap_or(RepeatMode::Off)
    }
}

impl From<String> for QueueSource {
    fn from(s: String) -> Self {
        QueueSource::from_str(&s).unwrap_or(QueueSource::Feed)
    }
}

impl From<String> for PlayMode {
    fn from(s: String) -> Self {
        PlayMode::from_str(&s).unwrap_or(PlayMode::Unified)
    }
}

impl From<String> for MatchSource {
    fn from(s: String) -> Self {
        MatchSource::from_str(&s).unwrap_or(MatchSource::Auto)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Episode {
    pub id: String,
    pub channel_id: String,
    pub external_id: String,
    pub title: String,
    pub description: Option<String>,
    pub thumbnail_url: Option<String>,
    pub duration_seconds: Option<i64>,
    pub published_at: Option<String>,
    pub url: Option<String>,
    pub video_id: Option<String>,
    pub podcast_guid: Option<String>,
    pub episode_number: Option<i64>,
    pub season_number: Option<i64>,
    pub audio_url: Option<String>,
    pub video_url: Option<String>,
    pub formats: Option<String>,
    pub chapters: Option<String>,
    pub sponsors: Option<String>,
    pub transcript_url: Option<String>,
    pub is_downloaded: bool,
    pub download_quality: Option<String>,
    pub progress_seconds: f64,
    pub created_at: String,
    pub updated_at: String,
    /// D6 (design-decisions.md): resolved at READ time by the feed/search/
    /// episode queries — id of the smart link pairing this episode with its
    /// cross-stream twin, when one exists. Skipped when absent so the JSON
    /// shape matches the mock layer (key absent, not null).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub smart_link_id: Option<String>,
    /// D6: the cross-stream twin's episode id, derived from the link.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub linked_episode_id: Option<String>,
    /// Resolved at READ time (like the smart-link fields): the channel this
    /// episode belongs to, so every surface can name it. Live-test
    /// 2026-10-27: only the mock layer attached it, so the real app showed
    /// "Unknown channel" everywhere. Absent (not null) when the channel row
    /// is gone, matching the mock's shape.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[sqlx(skip)]
    pub channel: Option<EpisodeChannel>,
}

/// The slice of a channel an episode carries for display.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EpisodeChannel {
    pub id: String,
    pub title: String,
    pub thumbnail_url: Option<String>,
    #[serde(rename = "type")]
    pub channel_type: ChannelType,
}

impl Episode {
    /// Parse formats JSON string into serde_json::Value
    pub fn formats_json(&self) -> Option<serde_json::Value> {
        self.formats.as_ref().and_then(|s| serde_json::from_str(s).ok())
    }

    /// Parse chapters JSON string into Vec<Chapter>
    pub fn chapters_json(&self) -> Option<Vec<Chapter>> {
        self.chapters.as_ref().and_then(|s| serde_json::from_str(s).ok())
    }

    /// Parse sponsors JSON string into Vec<SponsorSegment>
    pub fn sponsors_json(&self) -> Option<Vec<SponsorSegment>> {
        self.sponsors.as_ref().and_then(|s| serde_json::from_str(s).ok())
    }
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
    pub matched_at: DateTimeUtc,
    pub matched_by: MatchSource,
    pub title_similarity: Option<f64>,
    pub date_diff_days: Option<i64>,
    pub duration_diff_seconds: Option<i64>,
    pub user_confirmed: bool,
    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, strum::Display, strum::EnumString)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum MatchSource {
    Auto,
    Manual,
}

impl sqlx::Decode<'_, sqlx::Sqlite> for MatchSource {
    fn decode(value: sqlx::sqlite::SqliteValueRef<'_>) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let s = <&str as sqlx::Decode<'_, sqlx::Sqlite>>::decode(value)?;
        s.parse().map_err(|_| format!("Invalid MatchSource: {}", s).into())
    }
}

impl sqlx::Encode<'_, sqlx::Sqlite> for MatchSource {
    fn encode_by_ref(&self, buf: &mut Vec<sqlx::sqlite::SqliteArgumentValue<'_>>) -> sqlx::encode::IsNull {
        let s: String = self.to_string();
        <String as sqlx::Encode<'_, sqlx::Sqlite>>::encode(s, buf)
    }
}

impl sqlx::Type<sqlx::Sqlite> for MatchSource {
    fn type_info() -> sqlx::sqlite::SqliteTypeInfo {
        <String as sqlx::Type<sqlx::Sqlite>>::type_info()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchResult {
    pub matched_count: u32,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YoutubeVideo {
    pub id: String,
    pub video_id: String,
    pub title: String,
    pub channel_title: Option<String>,
    pub channel_id: Option<String>,
    pub published_at: Option<DateTimeUtc>,
    pub duration_seconds: Option<u64>,
    pub description: Option<String>,
    pub thumbnail_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstanceHealthLog {
    pub id: String,
    pub instance_id: String,
    pub health: InstanceHealth,
    pub latency_ms: Option<u64>,
    pub error_message: Option<String>,
    pub checked_at: DateTimeUtc,
    pub video_id_tested: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Queue {
    pub id: String,
    pub user_id: String,
    pub current_index: i64,
    pub repeat_mode: RepeatMode,
    pub shuffle: bool,
    pub audio_only_mode: bool,
    pub created_at: String,
    pub updated_at: String,
    #[sqlx(skip)]
    pub items: Vec<QueueItem>,
}

impl Default for Queue {
    fn default() -> Self {
        Self {
            id: String::new(),
            user_id: String::new(),
            current_index: 0,
            repeat_mode: RepeatMode::Off,
            shuffle: false,
            audio_only_mode: false,
            created_at: String::new(),
            updated_at: String::new(),
            items: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, strum::Display, strum::EnumString)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum RepeatMode {
    Off,
    One,
    All,
}

impl sqlx::Decode<'_, sqlx::Sqlite> for RepeatMode {
    fn decode(value: sqlx::sqlite::SqliteValueRef<'_>) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let s = <&str as sqlx::Decode<'_, sqlx::Sqlite>>::decode(value)?;
        s.parse().map_err(|_| format!("Invalid RepeatMode: {}", s).into())
    }
}

impl sqlx::Encode<'_, sqlx::Sqlite> for RepeatMode {
    fn encode_by_ref(&self, buf: &mut Vec<sqlx::sqlite::SqliteArgumentValue<'_>>) -> sqlx::encode::IsNull {
        let s: String = self.to_string();
        <String as sqlx::Encode<'_, sqlx::Sqlite>>::encode(s, buf)
    }
}

impl sqlx::Type<sqlx::Sqlite> for RepeatMode {
    fn type_info() -> sqlx::sqlite::SqliteTypeInfo {
        <String as sqlx::Type<sqlx::Sqlite>>::type_info()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct QueueItem {
    pub id: String,
    pub queue_id: String,
    pub episode_id: String,
    pub position: i64,
    pub added_at: String,
    pub source: QueueSource,
    pub play_mode: PlayMode,
    pub smart_link_id: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, strum::Display, strum::EnumString)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum QueueSource {
    Feed,
    Search,
    Manual,
    History,
    SmartLink,
}

impl sqlx::Decode<'_, sqlx::Sqlite> for QueueSource {
    fn decode(value: sqlx::sqlite::SqliteValueRef<'_>) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let s = <&str as sqlx::Decode<'_, sqlx::Sqlite>>::decode(value)?;
        s.parse().map_err(|_| format!("Invalid QueueSource: {}", s).into())
    }
}

impl sqlx::Encode<'_, sqlx::Sqlite> for QueueSource {
    fn encode_by_ref(&self, buf: &mut Vec<sqlx::sqlite::SqliteArgumentValue<'_>>) -> sqlx::encode::IsNull {
        let s: String = self.to_string();
        <String as sqlx::Encode<'_, sqlx::Sqlite>>::encode(s, buf)
    }
}

impl sqlx::Type<sqlx::Sqlite> for QueueSource {
    fn type_info() -> sqlx::sqlite::SqliteTypeInfo {
        <String as sqlx::Type<sqlx::Sqlite>>::type_info()
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, strum::Display, strum::EnumString)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum PlayMode {
    Video,
    Audio,
    Unified,
}

impl sqlx::Decode<'_, sqlx::Sqlite> for PlayMode {
    fn decode(value: sqlx::sqlite::SqliteValueRef<'_>) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let s = <&str as sqlx::Decode<'_, sqlx::Sqlite>>::decode(value)?;
        s.parse().map_err(|_| format!("Invalid PlayMode: {}", s).into())
    }
}

impl sqlx::Encode<'_, sqlx::Sqlite> for PlayMode {
    fn encode_by_ref(&self, buf: &mut Vec<sqlx::sqlite::SqliteArgumentValue<'_>>) -> sqlx::encode::IsNull {
        let s: String = self.to_string();
        <String as sqlx::Encode<'_, sqlx::Sqlite>>::encode(s, buf)
    }
}

impl sqlx::Type<sqlx::Sqlite> for PlayMode {
    fn type_info() -> sqlx::sqlite::SqliteTypeInfo {
        <String as sqlx::Type<sqlx::Sqlite>>::type_info()
    }
}

/// D7 (design-decisions.md): a per-channel rule mapping a title substring
/// pattern to the default play mode for matching episodes. Consulted in
/// priority order (highest first, then oldest created); first match wins.
/// The mode is deliberately narrowed to video|audio — a 'unified' rule would
/// be a no-op override, and the schema CHECK rejects it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayModeRule {
    pub id: String,
    pub channel_id: String,
    pub title_pattern: String,
    pub play_mode: PlayMode,
    pub priority: i64,
    pub created_at: String,
    pub updated_at: String,
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
    pub last_updated: DateTimeUtc,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Download {
    pub id: String,
    pub episode_id: String,
    pub quality: String,
    pub format: DownloadFormat,
    pub file_path: String,
    pub file_size: Option<i64>,
    pub status: DownloadStatus,
    pub progress: f64,
    pub error_message: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
}

impl Download {
    pub fn created_at_utc(&self) -> DateTimeUtc {
        DateTimeUtc::from(self.created_at.clone())
    }

    pub fn completed_at_utc(&self) -> Option<DateTimeUtc> {
        self.completed_at.as_ref().map(|s| DateTimeUtc::from(s.clone()))
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, strum::Display, strum::EnumString)]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "snake_case")]
pub enum DownloadFormat {
    Video,
    Audio,
}

impl sqlx::Decode<'_, sqlx::Sqlite> for DownloadFormat {
    fn decode(value: sqlx::sqlite::SqliteValueRef<'_>) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let s = <&str as sqlx::Decode<'_, sqlx::Sqlite>>::decode(value)?;
        s.parse().map_err(|_| format!("Invalid DownloadFormat: {}", s).into())
    }
}

impl sqlx::Encode<'_, sqlx::Sqlite> for DownloadFormat {
    fn encode_by_ref(&self, buf: &mut Vec<sqlx::sqlite::SqliteArgumentValue<'_>>) -> sqlx::encode::IsNull {
        let s: String = self.to_string();
        <String as sqlx::Encode<'_, sqlx::Sqlite>>::encode(s, buf)
    }
}

impl sqlx::Type<sqlx::Sqlite> for DownloadFormat {
    fn type_info() -> sqlx::sqlite::SqliteTypeInfo {
        <String as sqlx::Type<sqlx::Sqlite>>::type_info()
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, strum::Display, strum::EnumString)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum DownloadStatus {
    Pending,
    Downloading,
    Completed,
    Failed,
    Cancelled,
}

impl sqlx::Decode<'_, sqlx::Sqlite> for DownloadStatus {
    fn decode(value: sqlx::sqlite::SqliteValueRef<'_>) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let s = <&str as sqlx::Decode<'_, sqlx::Sqlite>>::decode(value)?;
        s.parse().map_err(|_| format!("Invalid DownloadStatus: {}", s).into())
    }
}

impl sqlx::Encode<'_, sqlx::Sqlite> for DownloadStatus {
    fn encode_by_ref(&self, buf: &mut Vec<sqlx::sqlite::SqliteArgumentValue<'_>>) -> sqlx::encode::IsNull {
        let s: String = self.to_string();
        <String as sqlx::Encode<'_, sqlx::Sqlite>>::encode(s, buf)
    }
}

impl sqlx::Type<sqlx::Sqlite> for DownloadStatus {
    fn type_info() -> sqlx::sqlite::SqliteTypeInfo {
        <String as sqlx::Type<sqlx::Sqlite>>::type_info()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub user_id: String,
    pub episode_id: String,
    pub position_seconds: f64,
    pub duration_seconds: Option<f64>,
    pub completed: bool,
    pub played_at: DateTimeUtc,
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
    pub last_fetched_at: Option<DateTimeUtc>,
    pub last_episode_published_at: Option<DateTimeUtc>,
    pub fetch_interval_minutes: u64,
    pub auto_download: bool,
    pub is_active: bool,
    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SponsorBlockSegment {
    pub video_id: String,
    pub segments: Vec<SponsorSegment>,
    pub fetched_at: DateTimeUtc,
    pub expires_at: DateTimeUtc,
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
    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, strum::Display, strum::EnumString)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum ShortcutContext {
    Global,
    Player,
    Queue,
    Feed,
}

impl sqlx::Decode<'_, sqlx::Sqlite> for ShortcutContext {
    fn decode(value: sqlx::sqlite::SqliteValueRef<'_>) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let s = <&str as sqlx::Decode<'_, sqlx::Sqlite>>::decode(value)?;
        s.parse().map_err(|_| format!("Invalid ShortcutContext: {}", s).into())
    }
}

impl sqlx::Encode<'_, sqlx::Sqlite> for ShortcutContext {
    fn encode_by_ref(&self, buf: &mut Vec<sqlx::sqlite::SqliteArgumentValue<'_>>) -> sqlx::encode::IsNull {
        let s: String = self.to_string();
        <String as sqlx::Encode<'_, sqlx::Sqlite>>::encode(s, buf)
    }
}

impl sqlx::Type<sqlx::Sqlite> for ShortcutContext {
    fn type_info() -> sqlx::sqlite::SqliteTypeInfo {
        <String as sqlx::Type<sqlx::Sqlite>>::type_info()
    }
}