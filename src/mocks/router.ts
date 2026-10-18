/**
 * Mock IPC router — routes command names to fixture handlers when the app
 * runs outside the Tauri shell. Wired through src/tauri-bridge.ts, never
 * imported by screens directly. Unknown commands REJECT: a silently-resolved
 * undefined would mask command-name typos as empty UI.
 */
import type { Episode, Instance, QueueItem, StreamInfo, UserPreferences } from '../types';
import { mockDb, type MockDb } from './data';

let db: MockDb;
let queueItems: QueueItem[];

/** Deep-clone the fixture db so tests (and dev reloads) start identical. */
export function resetMockState(): void {
  db = JSON.parse(JSON.stringify(mockDb)) as MockDb;
  queueItems = [];
}
resetMockState();

function requireEpisode(episodeId: string | undefined): Episode {
  const ep = db.episodes.find((e) => e.id === episodeId);
  if (!ep) throw new Error(`mock: unknown episode '${episodeId}'`);
  return ep;
}

type Handler = (args: Record<string, unknown> | undefined) => unknown;

// D6 (design-decisions.md): smart links resolve at READ time on the choice
// surfaces — every returned episode carries its cross-stream twin's id so
// the user's pick is already linked. Derivation is per-request (fixtures
// stay pristine); the real backend mirrors this in commands/episodes.rs.
function withChannelAndLinks(episodes: Episode[]): Episode[] {
  const byVideoId = new Map(db.episodes.filter((e) => e.video_id).map((e) => [e.video_id as string, e]));
  const byPodcastGuid = new Map(db.episodes.filter((e) => e.podcast_guid).map((e) => [e.podcast_guid as string, e]));
  return episodes.map((ep) => {
    const link = db.smartLinks.find(
      (l) =>
        (ep.podcast_guid && l.podcast_guid === ep.podcast_guid) ||
        (ep.video_id && l.youtube_video_id === ep.video_id)
    );
    if (!link) {
      return { ...ep, channel: db.channels.find((ch) => ch.id === ep.channel_id) };
    }
    const twin =
      (ep.podcast_guid && byVideoId.get(link.youtube_video_id)) ||
      (ep.video_id && byPodcastGuid.get(link.podcast_guid)) ||
      undefined;
    return {
      ...ep,
      smart_link_id: link.id,
      linked_episode_id: twin?.id,
      channel: db.channels.find((ch) => ch.id === ep.channel_id),
    };
  });
}

const handlers: Record<string, Handler> = {
  // Episodes
  get_feed: () => withChannelAndLinks(db.episodes),
  get_episode: (args) => {
    const ep = requireEpisode(args?.episodeId as string);
    return withChannelAndLinks([ep])[0];
  },
  search_episodes: (args) => {
    const q = String(args?.q ?? '').toLowerCase();
    return withChannelAndLinks(db.episodes.filter((e) => e.title.toLowerCase().includes(q)));
  },
  stream_episode: (args): StreamInfo => {
    const ep = requireEpisode(args?.episodeId as string);
    const format = (args?.format as string) ?? 'video';
    if (format === 'audio') {
      const url = ep.audio_url ?? '/mock-media/generic-audio.wav';
      return { url, format };
    }
    if (!ep.video_id) throw new Error(`mock: episode '${ep.id}' has no video stream`);
    // .webm (VP8/opus): headless chromium cannot decode H.264, and the e2e
    // specs play these files from public/mock-media/.
    return { url: `/mock-media/${ep.id}.webm`, format: 'video' };
  },

  // Channels / instances / smart links / history
  list: () => db.channels,
  list_instances: () => db.instances,
  add_instance: (args): Instance => {
    const url = String(args?.url ?? '').trim();
    const instanceType = args?.instanceType === 'piped' ? 'piped' : 'invidious';
    if (!url) throw new Error('mock: instance URL is required');
    const instance: Instance = {
      id: `inst-${crypto.randomUUID().slice(0, 8)}`,
      url,
      type: instanceType,
      health: 'unknown',
      auto_failover: true,
      supports_sabr: false,
      supports_age_restricted: false,
      pinned: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.instances = [...db.instances, instance];
    return instance;
  },
  list_smart_links: () => db.smartLinks,
  list_history: () => db.history,

  // Settings
  get_settings: (): UserPreferences => ({ ...db.preferences }),
  update_settings: (args) => {
    const prefs = (args?.prefs ?? {}) as Partial<UserPreferences>;
    db.preferences = { ...db.preferences, ...prefs };
  },

  // Queue (local mirror; the frontend store is authoritative in the slice)
  get_queue: () => ({
    id: 'local',
    user_id: 'current-user',
    current_index: 0,
    repeat_mode: 'off',
    shuffle: false,
    audio_only_mode: false,
    created_at: '2026-10-18T00:00:00Z',
    updated_at: '2026-10-18T00:00:00Z',
    items: queueItems,
  }),
  add_to_queue: (args) => {
    const ep = requireEpisode(args?.episodeId as string);
    const item: QueueItem = {
      id: crypto.randomUUID(),
      queue_id: 'local',
      episode_id: ep.id,
      position: queueItems.length,
      added_at: new Date().toISOString(),
      source: 'feed',
      play_mode: 'unified',
      episode: ep,
    };
    queueItems = [...queueItems, item];
    return item;
  },
  clear_queue: () => {
    queueItems = [];
  },

  // Playback state
  state: () => ({
    user_id: 'current-user',
    position_seconds: 0,
    playback_rate: 1,
    volume: 1,
    is_audio_mode: false,
    is_pip: false,
    last_updated: new Date().toISOString(),
  }),
};

export function mockInvoke<T = unknown>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  const handler = handlers[cmd];
  if (!handler) {
    return Promise.reject(new Error(`mock: no handler for command '${cmd}'`));
  }
  try {
    return Promise.resolve(handler(args) as T);
  } catch (err) {
    return Promise.reject(err);
  }
}
