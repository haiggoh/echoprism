import { invoke } from '../tauri-bridge';
import {
  Instance, InstanceHealthReport, Channel, Episode, EpisodeLink, PlayModeRule,
  Queue, QueueItem, PlaybackState, StreamInfo,
  UserPreferences, Download, HistoryEntry,
  KeyboardShortcut, PodcastSearchResult, SubscribedPodcast, CrashRecord, NotificationSummary, StoryboardSpec,
  ImportResult,
} from '../types';

// Command names and payloads are derived from the Rust commands registered in
// src-tauri/src/lib.rs `generate_handler![]`. Tauri v2 defaults:
//   - invoke name = the Rust function name
//   - argument keys = the Rust parameter names, camelCased (rename_all default)
// A consistency test asserts this file against the Rust signatures.

// Instance commands (instances.rs)
export const instanceCommands = {
  list: () => invoke<Instance[]>('list_instances'),
  add: (url: string, instanceType: 'invidious' | 'piped') => invoke<Instance>('add_instance', { url, instanceType }),
  remove: (id: string) => invoke<void>('remove_instance', { id }),
  test: (id: string) => invoke<InstanceHealthReport>('test_instance', { id }),
  failover: (fromId: string, toId: string) => invoke<void>('failover_instance', { fromId, toId }),
  health: () => invoke<InstanceHealthReport[]>('instance_health'),
  setAutoFailover: (enabled: boolean) => invoke<void>('set_auto_failover', { enabled }),
  dashboard: () => invoke<InstanceHealthReport[]>('health_dashboard'),
  toggleAutoFailover: (enabled: boolean) => invoke<void>('auto_failover_toggle', { enabled }),
};

// Channel commands (channels.rs)
export const channelCommands = {
  list: (params?: { type?: string; filter?: string }) => invoke<Channel[]>('list', { params }),
  subscribe: (externalId: string, channelType: 'video' | 'podcast' | 'both', instanceId?: string) =>
    invoke<Channel>('subscribe', { externalId, channelType, instanceId }),
  unsubscribe: (channelId: string) => invoke<void>('unsubscribe', { channelId }),
  import: (source: string, data: string) => invoke<{ imported: number; errors: string[] }>('import', { source, data }),
  export: (format: 'json' | 'opml') => invoke<string>('export', { format }),
};

// Episode commands (episodes.rs)
export const episodeCommands = {
  feed: (params?: { type?: string; filter?: string; channelId?: string; limit?: number; offset?: number }) =>
    invoke<Episode[]>('get_feed', { params }),
  get: (episodeId: string) => invoke<Episode>('get_episode', { episodeId }),
  search: (q: string, params?: { type?: string; filters?: Record<string, unknown> }) =>
    invoke<Episode[]>('search_episodes', { q, params }),
  stream: (episodeId: string, format?: string) =>
    invoke<StreamInfo>('stream_episode', { episodeId, format }),
};

// Podcast commands (podcasts.rs) — wired in 2e; the backend existed since 1c.
// subscribe_podcast's `title` is the optional fallback title (Rust
// prefers the feed's own title; omit it and the feed decides).
export const podcastCommands = {
  search: (term: string) => invoke<PodcastSearchResult[]>('search_podcasts', { term }),
  /** Import YouTube-channel subscriptions from an Invidious instance.
   *  Dedupes on the channel's external_id, so a re-run reports 0. */
  importFromYoutube: (instanceUrl: string) =>
    invoke<ImportResult>('import_youtube_subscriptions', { instanceUrl }),
  subscribe: (feedUrl: string, title?: string) =>
    invoke<SubscribedPodcast>('subscribe_podcast', { feedUrl, title }),
  // Live-test feature: the manual trigger for the background refresh's
  // logic — imported feeds (last_fetched_at NULL) are due immediately.
  refresh: () => invoke<number>('refresh_podcasts'),
};

// Episode notifications (notifications.rs) — the real bell: new episodes
// across subscribed channels since the last seen instant.
export const notificationCommands = {
  summary: () => invoke<NotificationSummary>('episode_notifications'),
  markSeen: () => invoke<void>('mark_episodes_seen'),
};

// Hover preview (Phase E) — one call per NEW hovered video id; null keeps
// the static thumbnail.
export const previewCommands = {
  frames: (videoId: string) => invoke<StoryboardSpec | null>('preview_frames', { videoId }),
};

// Crash reporting (crash.rs, 4f) — capture is local-only; the only egress
// is open_external_url for the user's own prefilled-issue submission.
export const crashCommands = {
  reports: () => invoke<CrashRecord[]>('get_crash_reports'),
  clear: () => invoke<void>('clear_crash_reports'),
  logFrontendError: (kind: string, message: string) =>
    invoke<void>('log_frontend_error', { kind, message }),
  openExternalUrl: (url: string) => invoke<void>('open_external_url', { url }),
};

// Queue commands (queue.rs)
export const queueCommands = {
  get: () => invoke<Queue>('get_queue'),
  add: (episodeId: string, mode?: 'video' | 'audio' | 'unified', position?: number) =>
    invoke<QueueItem>('add_to_queue', { episodeId, mode, position }),
  reorder: (from: number, to: number) => invoke<void>('reorder_queue', { from, to }),
  remove: (itemId: string) => invoke<void>('remove_queue_item', { itemId }),
  clear: () => invoke<void>('clear_queue'),
  playNext: (episodeId: string) => invoke<void>('play_next_queue', { episodeId }),
};

// Playback commands (playback.rs)
export const playbackCommands = {
  state: () => invoke<PlaybackState>('state'),
  update: (params: { position?: number; rate?: number; volume?: number; audio_mode?: boolean }) =>
    invoke<void>('update', { params }),
};

// Smart Links commands (smart_links.rs)
export const smartLinkCommands = {
  list: (confidenceMin?: number) => invoke<EpisodeLink[]>('list_smart_links', { confidenceMin }),
  match: () => invoke<{ matched_count: number }>('match_episodes'),
  confirm: (linkId: string, confirmed: boolean) => invoke<void>('confirm_smart_link', { linkId, confirmed }),
  unlink: (linkId: string) => invoke<void>('unlink_smart_link', { linkId }),
};

// Play-mode rule commands (play_mode_rules.rs) — D7 per-title-family
// defaults: (channel, title-pattern) → 'video' | 'audio'.
export const playModeRuleCommands = {
  list: (channelId?: string) => invoke<PlayModeRule[]>('list_play_mode_rules', { channelId }),
  set: (channelId: string, titlePattern: string, playMode: 'video' | 'audio', priority?: number) =>
    invoke<PlayModeRule>('set_play_mode_rule', { channelId, titlePattern, playMode, priority }),
  remove: (ruleId: string) => invoke<void>('remove_play_mode_rule', { ruleId }),
};

// Download commands (downloads.rs)
export const downloadCommands = {
  start: (episodeId: string, quality: string, format: 'video' | 'audio') =>
    invoke<Download>('start_download', { episodeId, quality, format }),
  list: (status?: string) => invoke<Download[]>('list_downloads', { status }),
  cancel: (id: string) => invoke<void>('cancel_download', { id }),
  delete: (id: string) => invoke<void>('delete_download', { id }),
};

// Settings commands (settings.rs)
export const settingsCommands = {
  get: () => invoke<UserPreferences>('get_settings'),
  update: (prefs: Partial<UserPreferences>) => invoke<void>('update_settings', { prefs }),
};

// History commands (history.rs)
export const historyCommands = {
  list: (limit?: number, offset?: number) => invoke<HistoryEntry[]>('list_history', { limit, offset }),
  clear: () => invoke<void>('clear_history'),
  record: (episodeId: string) => invoke<HistoryEntry>('record_history', { episodeId }),
};

// Keyboard shortcuts (shortcuts.rs)
export const shortcutCommands = {
  list: () => invoke<KeyboardShortcut[]>('list_shortcuts'),
  update: (action: string, key: string, context: string) => invoke<void>('update_shortcut_cmd', { action, key, context }),
};
