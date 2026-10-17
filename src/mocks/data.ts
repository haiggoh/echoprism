/**
 * Mock fixture database — the dev/browser stand-in for the SQLite backend
 * (P3 phase 2). Only used when the app runs OUTSIDE the Tauri shell (the
 * bridge routes on __TAURI_INTERNALS__). Fixtures honor the binding design
 * decisions: D1 (auto_download_wifi = 0 — queue-add never implies download)
 * and D2 (card_click_action = 'auto' default).
 */
import type {
  Channel, Episode, EpisodeLink, HistoryEntry, Instance, UserPreferences,
} from '../types';

export interface MockDb {
  channels: Channel[];
  episodes: Episode[];
  instances: Instance[];
  smartLinks: EpisodeLink[];
  history: HistoryEntry[];
  preferences: UserPreferences;
}

const now = '2026-10-18T00:00:00Z';

export const mockDb: MockDb = {
  channels: [
    {
      id: 'ch-1',
      user_id: 'current-user',
      external_id: 'UC-mock-tech-talks',
      title: 'Tech Talks Weekly',
      is_subscribed: true,
      subscribed_at: now,
      notifications_enabled: false,
      format_preference: 'both',
      type: 'video',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'ch-2',
      user_id: 'current-user',
      external_id: 'https://feeds.example.org/deep-dive.xml',
      title: 'The Deep Dive Podcast',
      is_subscribed: true,
      subscribed_at: now,
      notifications_enabled: false,
      format_preference: 'both',
      type: 'podcast',
      podcast_feed_url: 'https://feeds.example.org/deep-dive.xml',
      created_at: now,
      updated_at: now,
    },
  ],
  episodes: [
    {
      id: 'ep-video-1',
      channel_id: 'ch-1',
      external_id: 'dQw4w9WgXcQ',
      title: 'video: How Invidious pools actually work',
      video_id: 'dQw4w9WgXcQ',
      duration_seconds: 613,
      progress_seconds: 0,
      is_downloaded: false,
      published_at: '2026-10-10T00:00:00Z',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'ep-video-2',
      channel_id: 'ch-1',
      external_id: 'aqz-KE-bpKQ',
      title: 'video: Big Buck Bunny, explained frame by frame',
      video_id: 'aqz-KE-bpKQ',
      duration_seconds: 635,
      // Resumed mid-play: exercises position restore (D3) in e2e.
      progress_seconds: 120,
      is_downloaded: false,
      published_at: '2026-10-12T00:00:00Z',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'ep-pod-1',
      channel_id: 'ch-2',
      external_id: 'deep-dive-042',
      title: 'podcast: Episode 42 — RSS is winning again',
      podcast_guid: 'deep-dive-042',
      audio_url: '/mock-media/ep-pod-1.wav',
      duration_seconds: 3180,
      progress_seconds: 0,
      is_downloaded: false,
      published_at: '2026-10-14T00:00:00Z',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'ep-pod-2',
      channel_id: 'ch-2',
      external_id: 'deep-dive-041',
      title: 'podcast: Episode 41 — The instance reliability problem',
      podcast_guid: 'deep-dive-041',
      audio_url: '/mock-media/ep-pod-2.wav',
      duration_seconds: 2940,
      progress_seconds: 0,
      is_downloaded: false,
      published_at: '2026-10-07T00:00:00Z',
      created_at: now,
      updated_at: now,
    },
  ],
  instances: [
    {
      id: 'inst-1',
      url: 'https://invidious.example.dev',
      type: 'invidious',
      health: 'healthy',
      latency_ms: 87,
      auto_failover: true,
      supports_sabr: false,
      supports_age_restricted: false,
      pinned: false,
      created_at: now,
      updated_at: now,
    },
  ],
  smartLinks: [
    {
      id: 'link-1',
      podcast_guid: 'deep-dive-042',
      youtube_video_id: 'dQw4w9WgXcQ',
      confidence: 0.92,
      matched_at: '2026-10-16T03:00:00Z',
      matched_by: 'auto',
      user_confirmed: false,
      created_at: now,
      updated_at: now,
    },
  ],
  history: [
    {
      id: 'hist-1',
      user_id: 'current-user',
      episode_id: 'ep-video-2',
      position_seconds: 120,
      completed: false,
      played_at: '2026-10-16T21:00:00Z',
    },
  ],
  preferences: {
    user_id: 'current-user',
    default_format: 'unified',
    queue_behavior: 'play_next',
    audio_only_default: false,
    auto_download_wifi: false, // D1: never download on queue-add (parsed shape)
    sponsorblock_enabled: true,
    sponsorblock_categories: ['sponsor', 'selfpromo'],
    keyboard_shortcuts_enabled: true,
    theme: 'system',
    cross_device_sync_enabled: false,
    card_click_action: 'auto', // D2 default
    updated_at: now,
  },
};
