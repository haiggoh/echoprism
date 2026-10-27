// Core types for EchoPrism

export interface User {
  id: string;
  created_at: string;
  updated_at: string;
}

export interface UserPreferences {
  user_id: string;
  default_instance_id?: string;
  default_format: 'video' | 'audio' | 'unified';
  queue_behavior: 'play_next' | 'add_end';
  audio_only_default: boolean;
  auto_download_wifi: boolean;
  sponsorblock_enabled: boolean;
  sponsorblock_categories: string[];
  keyboard_shortcuts_enabled: boolean;
  theme: 'dark' | 'light' | 'system';
  cross_device_sync_enabled: boolean;
  card_click_action: 'auto' | 'play_now' | 'load_paused' | 'queue';
  updated_at: string;
}

// ============================
// INSTANCES
// ============================

export type InstanceType = 'invidious' | 'piped';
export type InstanceHealth = 'healthy' | 'degraded' | 'failed' | 'unknown';

export interface Instance {
  id: string;
  url: string;
  type: InstanceType;
  health: InstanceHealth;
  latency_ms?: number;
  last_checked?: string;
  auto_failover: boolean;
  supports_sabr: boolean;
  supports_age_restricted: boolean;
  region?: string;
  country?: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface InstanceHealthLog {
  id: number;
  instance_id: string;
  checked_at: string;
  latency_ms?: number;
  status: InstanceHealth;
  error_message?: string;
  video_id_tested?: string;
}

// ============================
// CHANNELS
// ============================

export type ChannelType = 'video' | 'podcast' | 'both';
export type FormatPreference = 'video' | 'audio' | 'both';

export interface Channel {
  id: string;
  user_id: string;
  external_id: string;
  title: string;
  handle?: string;
  thumbnail_url?: string;
  description?: string;
  subscriber_count?: number;
  is_subscribed: boolean;
  subscribed_at: string;
  notifications_enabled: boolean;
  format_preference: FormatPreference;
  instance_id?: string;
  type: ChannelType;
  home_url?: string;
  podcast_feed_url?: string;
  podcast_guid?: string;
  last_fetched_at?: string;
  created_at: string;
  updated_at: string;
}

// ============================
// EPISODES / VIDEOS (Unified)
// ============================

export interface EpisodeFormat {
  quality: string;
  format: string;
  url: string;
  mime_type?: string;
}

export interface Chapter {
  start_time: number;
  end_time: number;
  title: string;
  image_url?: string;
}

export interface SponsorSegment {
  start_time: number;
  end_time: number;
  category: string;
  uuid: string;
}

export interface Episode {
  id: string;
  channel_id: string;
  external_id: string;
  title: string;
  description?: string;
  thumbnail_url?: string;
  duration_seconds?: number;
  published_at?: string;
  url?: string;
  video_id?: string;
  podcast_guid?: string;
  episode_number?: number;
  season_number?: number;
  audio_url?: string;
  video_url?: string;
  formats?: EpisodeFormat[];
  chapters?: Chapter[];
  sponsors?: SponsorSegment[];
  transcript_url?: string;
  is_downloaded: boolean;
  download_quality?: string;
  progress_seconds: number;
  smart_link_id?: string;
  /** Derived at read time (D6): the cross-stream twin's episode id, resolved
   *  from the episode_links join — present only when a link exists. */
  linked_episode_id?: string;
  channel?: {
    id: string;
    title: string;
    thumbnail_url?: string;
  };
  created_at: string;
  updated_at: string;
}

// ============================
// SMART EPISODE LINKS
// ============================

export type MatchSource = 'auto' | 'manual';

export interface EpisodeLink {
  id: string;
  podcast_guid: string;
  youtube_video_id: string;
  confidence: number;
  matched_at: string;
  matched_by: 'auto' | 'manual';
  title_similarity?: number;
  date_diff_days?: number;
  duration_diff_seconds?: number;
  user_confirmed: boolean;
  created_at: string;
  updated_at: string;
}

// ============================
// PLAY MODE RULES (D7)
// ============================

/**
 * D7 (design-decisions.md): a per-channel rule mapping a title substring
 * pattern to the default play mode for matching episodes. Consulted in
 * priority order (highest first, then oldest created); first match wins.
 * Owner case: channel ch-3 pattern 'Some More News' → video, ch-4 pattern
 * 'Even More News' → audio. Note the mode is deliberately narrowed to
 * 'video' | 'audio' — a 'unified' rule would be a no-op override.
 */
export interface PlayModeRule {
  id: string;
  channel_id: string;
  title_pattern: string;
  play_mode: 'video' | 'audio';
  priority: number;
  created_at: string;
  updated_at: string;
}

// ============================
// QUEUE
// ============================

export type RepeatMode = 'off' | 'one' | 'all';
export type PlayMode = 'video' | 'audio' | 'unified';
export type QueueSource = 'feed' | 'search' | 'manual' | 'history' | 'smart_link';

export interface Queue {
  id: string;
  user_id: string;
  current_index: number;
  repeat_mode: 'off' | 'one' | 'all';
  shuffle: boolean;
  audio_only_mode: boolean;
  created_at: string;
  updated_at: string;
}

export interface QueueItem {
  id: string;
  queue_id: string;
  episode_id: string;
  position: number;
  added_at: string;
  source: QueueSource;
  play_mode: PlayMode;
  smart_link_id?: string;
  episode?: Episode;
}

// ============================
// PLAYBACK STATE
// ============================

export interface PlaybackState {
  user_id: string;
  episode_id?: string;
  position_seconds: number;
  duration_seconds?: number;
  playback_rate: number;
  volume: number;
  is_audio_mode: boolean;
  is_pip: boolean;
  current_instance_id?: string;
  last_updated: string;
}

// ============================
// DOWNLOADS
// ============================

export type DownloadStatus = 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled';

export interface Download {
  id: string;
  episode_id: string;
  quality: string;
  format: 'video' | 'audio';
  file_path: string;
  file_size?: number;
  status: DownloadStatus;
  progress: number;
  error_message?: string;
  created_at: string;
  completed_at?: string;
}

// ============================
// HISTORY
// ============================

export interface HistoryEntry {
  id: string;
  user_id: string;
  episode_id: string;
  position_seconds: number;
  duration_seconds?: number;
  completed: boolean;
  played_at: string;
  /** Live-test pass 2: hydrated by the list command (episode may have been
   *  deleted since — the row then renders without a title, not broken). */
  episode_title?: string;
  episode_thumbnail?: string;
}

// ============================
// PODCAST FEEDS
// ============================

export interface PodcastFeed {
  id: string;
  user_id: string;
  feed_url: string;
  title?: string;
  description?: string;
  thumbnail_url?: string;
  link?: string;
  language?: string;
  author?: string;
  categories?: string[];
  last_fetched_at?: string;
  last_episode_published_at?: string;
  fetch_interval_minutes: number;
  auto_download: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================
// SPONSORBLOCK
// ============================

export interface SponsorBlockSegment {
  video_id: string;
  segments: SponsorSegment[];
  fetched_at: string;
  expires_at: string;
}

export interface SponsorSegment {
  start_time: number;
  end_time: number;
  category: string;
  uuid: string;
  votes?: number;
}

// ============================
// KEYBOARD SHORTCUTS
// ============================

export type ShortcutContext = 'global' | 'player' | 'queue' | 'feed';

export interface KeyboardShortcut {
  id: string;
  user_id: string;
  action: string;
  key_combination: string;
  context: ShortcutContext;
  enabled: boolean;
  is_custom: boolean;
  created_at: string;
  updated_at: string;
}

// ============================
// API RESPONSES
// ============================

export interface InstanceHealthReport {
  id: string;
  url: string;
  type: 'invidious' | 'piped';
  health: 'healthy' | 'degraded' | 'failed' | 'unknown';
  latency_ms?: number;
  last_checked?: string;
  supports_sabr: boolean;
  supports_age_restricted: boolean;
  region?: string;
}

export interface PodcastSearchResult {
  title: string;
  author?: string;
  feed_url: string;
  artwork?: string;
  genres: string[];
}

export interface SubscribedPodcast {  channel_id: string;
  title: string;
  new_episodes: number;
}

export interface StreamInfo {
  url: string;
  headers?: Record<string, string>;
  format: string;
}

/** Live-test feature: the bell's payload — new episodes across subscribed
 *  channels since the last seen instant. */
export interface NewEpisodeItem {
  id: string;
  title: string;
  channel_title: string;
  published_at?: string;
  kind: string;
}

export interface NotificationSummary {
  new_count: number;
  episodes: NewEpisodeItem[];
}

/** Phase E: a hover-preview storyboard (sprite-sheet pages + timing),
 *  served from Piped's previewFrames; null = keep the static thumbnail. */
export interface StoryboardSpec {
  urls: string[];
  frame_width: number;
  frame_height: number;
  frames_per_page_x: number;
  frames_per_page_y: number;
  duration_per_frame_ms: number;
  total_count: number;
}

/** 4f: one locally captured crash record (sanitized backend-side). */
export interface CrashRecord {
  /** "panic" | "js-error" | "js-rejection" */
  kind: string;
  /** The dedup key the triage Action groups issues by. */
  signature: string;
  /** Sanitized — no home paths, no usernames. */
  message: string;
  app_version: string;
  at: string;
}

export interface EpisodeWithChannel extends Episode {
  channel?: {
    id: string;
    title: string;
    handle?: string;
    thumbnail_url?: string;
  };
}

// ============================
// UI STATE
// ============================

export interface UIState {
  sidebarOpen: boolean;
  miniPlayerOpen: boolean;
  fullscreenPlayer: boolean;
  currentRoute: string;
  previousRoute: string;
  sidebarCollapsed: boolean;
}

export type ViewMode = 'feed' | 'queue' | 'player' | 'search' | 'settings' | 'history' | 'downloads' | 'channels' | 'smart-links';

/** Shared import contract (Rust `podcast::ImportResult`): what OPML import and
 *  the YouTube-subscription import both return. `imported` counts rows ACTUALLY
 *  written — duplicates are skipped, not counted — so a re-run reports 0. */
export interface ImportResult {
  imported: number;
  errors: string[];
}
