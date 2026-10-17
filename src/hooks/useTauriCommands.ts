import { invoke } from '../tauri-bridge';
import {
  Instance, InstanceHealthReport, Channel, Episode, EpisodeLink,
  Queue, QueueItem, PlaybackState, StreamInfo,
  UserPreferences, Download, HistoryEntry,
  KeyboardShortcut
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
  feed: (params?: { type?: string; filter?: string; limit?: number; offset?: number }) =>
    invoke<Episode[]>('get_feed', { params }),
  get: (episodeId: string) => invoke<Episode>('get_episode', { episodeId }),
  search: (q: string, params?: { type?: string; filters?: Record<string, unknown> }) =>
    invoke<Episode[]>('search_episodes', { q, params }),
  stream: (episodeId: string, format?: string) =>
    invoke<StreamInfo>('stream_episode', { episodeId, format }),
  smartLinkSwitch: (linkId: string) => invoke<void>('smart_link_switch_episode', { linkId }),
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
  toggleAudio: (episodeId: string) => invoke<void>('toggle_audio', { episodeId }),
  smartLink: (linkId: string) => invoke<void>('smart_link', { linkId }),
};

// Smart Links commands (smart_links.rs)
export const smartLinkCommands = {
  list: (confidenceMin?: number) => invoke<EpisodeLink[]>('list_smart_links', { confidenceMin }),
  match: () => invoke<{ matched_count: number }>('match_episodes'),
  confirm: (linkId: string, confirmed: boolean) => invoke<void>('confirm_smart_link', { linkId, confirmed }),
  unlink: (linkId: string) => invoke<void>('unlink_smart_link', { linkId }),
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
};

// Keyboard shortcuts (shortcuts.rs)
export const shortcutCommands = {
  list: () => invoke<KeyboardShortcut[]>('list_shortcuts'),
  update: (action: string, key: string, context: string) => invoke<void>('update_shortcut_cmd', { action, key, context }),
};

// Background jobs (background.rs) — manual triggers for the background tasks
export const backgroundJobs = {
  instanceHealth: () => invoke<void>('trigger_instance_health_check'),
  smartLink: () => invoke<void>('trigger_smart_linking'),
  feedFetch: () => invoke<void>('trigger_feed_fetch'),
  sponsorblockSync: () => invoke<void>('trigger_sponsorblock_sync'),
  cleanup: () => invoke<void>('trigger_cleanup'),
};
