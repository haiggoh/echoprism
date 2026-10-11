import { invoke } from '@tauri-apps/api/core';
import { 
  Instance, InstanceHealth, Channel, Episode, EpisodeLink, 
  Queue, QueueItem, PlaybackState, StreamInfo, 
  UserPreferences, Download, HistoryEntry, 
  KeyboardShortcut, SponsorSegment 
} from '../../types';

// Instance commands
export const instanceCommands = {
  list: () => invoke<Instance[]>('instances:list'),
  add: (url: string, type: 'invidious' | 'piped') => invoke<Instance>('instances:add', { url, type }),
  remove: (id: string) => invoke<void>('instances:remove', { id }),
  test: (id: string) => invoke<InstanceHealth>('instances:test', { id }),
  failover: (fromId: string, toId: string) => invoke<void>('instances:failover', { from_id: fromId, to_id: toId }),
  health: () => invoke<InstanceHealth[]>('instances:health'),
  autoFailover: (enabled: boolean) => invoke<void>('instances:auto-failover', { enabled }),
};

// Channel commands
export const channelCommands = {
  list: (params?: { type?: string; filter?: string }) => invoke<Channel[]>('channels:list', params),
  subscribe: (externalId: string, type: 'video' | 'podcast' | 'both', instanceId?: string) => 
    invoke<Channel>('channels:subscribe', { external_id: externalId, type, instance_id: instanceId }),
  unsubscribe: (channelId: string) => invoke<void>('channels:unsubscribe', { channel_id: channelId }),
  import: (source: string, data: string) => invoke<{ imported: number; errors: string[] }>('channels:import', { source, data }),
  export: (format: 'json' | 'opml') => invoke<string>('channels:export', { format }),
};

// Episode commands
export const episodeCommands = {
  feed: (params?: { type?: string; filter?: string; limit?: number; offset?: number }) => 
    invoke<Episode[]>('episodes:feed', params),
  get: (episodeId: string) => invoke<Episode>('episodes:get', { episode_id: episodeId }),
  search: (q: string, params?: { type?: string; filters?: Record<string, any> }) => 
    invoke<Episode[]>('episodes:search', { q, ...params }),
  stream: (episodeId: string, format?: string, quality?: string) => 
    invoke<StreamInfo>('episodes:stream', { episode_id: episodeId, format, quality }),
  smartLinkSwitch: (linkId: string) => invoke<void>('playback:smart-link', { link_id: linkId }),
};

// Queue commands
export const queueCommands = {
  get: () => invoke<Queue>('queue:get'),
  add: (episodeId: string, mode?: 'video' | 'audio' | 'unified', position?: number) => 
    invoke<QueueItem>('queue:add', { episode_id: episodeId, mode, position }),
  reorder: (from: number, to: number) => invoke<void>('queue:reorder', { from, to }),
  remove: (itemId: string) => invoke<void>('queue:remove', { item_id: itemId }),
  clear: () => invoke<void>('queue:clear'),
  playNext: (episodeId: string) => invoke<void>('queue:play-next', { episode_id: episodeId }),
};

// Playback commands
export const playbackCommands = {
  state: () => invoke<PlaybackState>('playback:state'),
  update: (params: { position?: number; rate?: number; volume?: number; audio_mode?: boolean }) => 
    invoke<void>('playback:update', params),
  toggleAudio: (episodeId: string) => invoke<void>('playback:toggle-audio', { episode_id: episodeId }),
  smartLink: (linkId: string) => invoke<void>('playback:smart-link', { link_id: linkId }),
};

// Smart Links commands
export const smartLinkCommands = {
  list: (confidenceMin?: number) => invoke<EpisodeLink[]>('smart-links:list', { confidence_min: confidenceMin }),
  match: () => invoke<{ matched_count: number }>('smart-links:match'),
  confirm: (linkId: string, confirmed: boolean) => invoke<void>('smart-links:confirm', { link_id: linkId, confirmed }),
  unlink: (linkId: string) => invoke<void>('smart-links:unlink', { link_id: linkId }),
};

// Instance commands (alias)
export const instanceCommandsAlias = {
  health: () => invoke<InstanceHealth[]>('instances:health'),
  autoFailover: (enabled: boolean) => invoke<void>('instances:auto-failover', { enabled }),
};

// Download commands
export const downloadCommands = {
  start: (episodeId: string, quality: string, format: 'video' | 'audio') => 
    invoke<Download>('downloads:start', { episode_id: episodeId, quality, format }),
  list: (status?: string) => invoke<Download[]>('downloads:list', { status }),
  cancel: (id: string) => invoke<void>('downloads:cancel', { id }),
  delete: (id: string) => invoke<void>('downloads:delete', { id }),
};

// Settings commands
export const settingsCommands = {
  get: () => invoke<UserPreferences>('settings:get'),
  update: (prefs: Partial<UserPreferences>) => invoke<void>('settings:update', prefs),
};

// History commands
export const historyCommands = {
  list: (limit?: number, offset?: number) => invoke<HistoryEntry[]>('history:list', { limit, offset }),
  clear: () => invoke<void>('history:clear'),
};

// Keyboard shortcuts
export const shortcutCommands = {
  list: () => invoke<KeyboardShortcut[]>('shortcuts:list'),
  update: (action: string, key: string, context: string) => invoke<void>('shortcuts:update', { action, key, context }),
};

// Smart Links commands (alias)
export const smartLinksCommands = {
  list: (confidenceMin?: number) => invoke<EpisodeLink[]>('smart-links:list', { confidence_min: confidenceMin }),
  match: () => invoke<{ matched_count: number }>('smart-links:match'),
  confirm: (linkId: string, confirmed: boolean) => invoke<void>('smart-links:confirm', { link_id: linkId, confirmed }),
  unlink: (linkId: string) => invoke<void>('smart-links:unlink', { link_id: linkId }),
};

// Background jobs (Internal)
export const backgroundJobs = {
  instanceHealth: () => invoke<void>('background:instance-health'),
  smartLink: () => invoke<void>('background:smart-link'),
  feedFetch: () => invoke<void>('background:feed-fetch'),
  sponsorblockSync: () => invoke<void>('background:sponsorblock-sync'),
  cleanup: () => invoke<void>('background:cleanup'),
};
