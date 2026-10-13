//! Configuration for EchoPrism

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub instances: Vec<InstanceConfig>,
    pub preferences: UserPreferences,
    pub keyboard_shortcuts: HashMap<String, String>,
    pub theme: Theme,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstanceConfig {
    pub id: String,
    pub url: String,
    pub instance_type: InstanceType,
    pub auto_failover: bool,
    pub supports_sabr: bool,
    pub supports_age_restricted: bool,
    pub region: Option<String>,
    pub country: Option<String>,
    pub pinned: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPreferences {
    pub default_instance_id: Option<String>,
    pub default_format: Format,
    pub queue_behavior: QueueBehavior,
    pub audio_only_default: bool,
    pub auto_download_wifi: bool,
    pub sponsorblock_enabled: bool,
    pub sponsorblock_categories: Vec<String>,
    pub keyboard_shortcuts_enabled: bool,
    pub cross_device_sync_enabled: bool,
}

impl Default for UserPreferences {
    fn default() -> Self {
        Self {
            default_instance_id: None,
            default_format: Format::Unified,
            queue_behavior: QueueBehavior::PlayNext,
            audio_only_default: false,
            auto_download_wifi: true,
            sponsorblock_enabled: true,
            sponsorblock_categories: vec!["sponsor".to_string(), "selfpromo".to_string(), "interaction".to_string(), "intro".to_string(), "outro".to_string()],
            keyboard_shortcuts_enabled: true,
            cross_device_sync_enabled: false,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum InstanceType {
    Invidious,
    Piped,
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

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            instances: vec![],
            preferences: UserPreferences::default(),
            keyboard_shortcuts: HashMap::new(),
            theme: Theme::System,
        }
    }
}