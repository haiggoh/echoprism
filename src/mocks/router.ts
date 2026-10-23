/**
 * Mock IPC router — routes command names to fixture handlers when the app
 * runs outside the Tauri shell. Wired through src/tauri-bridge.ts, never
 * imported by screens directly. Unknown commands REJECT: a silently-resolved
 * undefined would mask command-name typos as empty UI.
 */
import type { CrashRecord, Download, Episode, Instance, PlayModeRule, PodcastSearchResult, QueueItem, StreamInfo, SubscribedPodcast, UserPreferences } from '../types';
import { mockDb, type MockDb } from './data';

let db: MockDb;
let queueItems: QueueItem[];
let crashRecords: CrashRecord[];

/** Deep-clone the fixture db so tests (and dev reloads) start identical. */
export function resetMockState(): void {
  db = JSON.parse(JSON.stringify(mockDb)) as MockDb;
  queueItems = [];
  crashRecords = [
    {
      kind: 'panic',
      signature: '1a2b3c4d',
      message: 'panicked at src/main.rs:42:10:\nfixture crash for the settings section',
      app_version: '0.1.0',
      at: '2026-10-23T12:00:00Z',
    },
  ];
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
      // A twin is the OTHER stream's episode (mirrors the Rust self-link
      // guard): a both-keys row whose link resolves back to itself is not
      // linked.
      linked_episode_id: twin && twin.id !== ep.id ? twin.id : undefined,
      channel: db.channels.find((ch) => ch.id === ep.channel_id),
    };
  });
}

const handlers: Record<string, Handler> = {
  // Episodes
  get_feed: (args) => {
    // Mirrors the Rust FeedParams: `type` filters by the CHANNEL's type
    // (the Rust JOIN), `channelId` (2e) by the episode's channel_id.
    const params = (args?.params ?? {}) as { type?: string; channelId?: string; limit?: number; offset?: number };
    let rows = db.episodes;
    if (params.type) {
      const typeByChannel = new Map(db.channels.map((ch) => [ch.id, ch.type]));
      rows = rows.filter((e) => typeByChannel.get(e.channel_id) === params.type);
    }
    if (params.channelId) {
      rows = rows.filter((e) => e.channel_id === params.channelId);
    }
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 50;
    return withChannelAndLinks(rows.slice(offset, offset + limit));
  },
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
    if (!ep.video_id) {
      // Phase A mirrors the Rust enclosure path: a podcast-shaped episode
      // (no video stream, enclosure present) resolves its enclosure even
      // for a video request — playing the audio beats an error.
      const enclosure = ep.audio_url?.trim();
      if (enclosure) return { url: enclosure, format: 'audio' };
      throw new Error(`mock: episode '${ep.id}' has no video stream`);
    }
    // .webm (VP8/opus): headless chromium cannot decode H.264, and the e2e
    // specs play these files from public/mock-media/.
    return { url: `/mock-media/${ep.id}.webm`, format: 'video' };
  },

  // Podcasts (2e — mirrors commands/podcasts.rs). search_podcasts filters
  // the fixture directory across title/author/genres (the Rust command hits
  // iTunes live). subscribe_podcast persists channel + episodes like the
  // one-transaction Rust upsert, is idempotent on the feed URL, and
  // REJECTS an unknown feed: the real backend fetches any URL, the mock has
  // no fetcher, and a silently-invented subscription would hide the
  // contract from the e2e world.
  search_podcasts: (args): PodcastSearchResult[] => {
    const term = String(args?.term ?? '').trim().toLowerCase();
    if (!term) return [];
    return db.podcastDirectory
      .filter((p) =>
        [p.result.title, p.result.author ?? '', ...p.result.genres].some((v) =>
          v.toLowerCase().includes(term),
        ),
      )
      .map((p) => ({ ...p.result }));
  },
  subscribe_podcast: (args): SubscribedPodcast => {
    const feedUrl = String(args?.feedUrl ?? '').trim();
    if (!feedUrl) throw new Error('mock: feed URL required');
    const fixture = db.podcastDirectory.find((p) => p.result.feed_url === feedUrl);
    if (!fixture) throw new Error(`mock: unknown podcast feed: ${feedUrl}`);
    const existing = db.channels.find((c) => c.podcast_feed_url === feedUrl);
    if (existing) {
      return { channel_id: existing.id, title: fixture.result.title, new_episodes: 0 };
    }
    const channelId = `pod-${crypto.randomUUID().slice(0, 8)}`;
    const nowIso = new Date().toISOString();
    db.channels = [
      ...db.channels,
      {
        id: channelId,
        user_id: 'current-user',
        external_id: feedUrl,
        title: fixture.result.title,
        thumbnail_url: fixture.result.artwork,
        is_subscribed: true,
        subscribed_at: nowIso,
        notifications_enabled: false,
        format_preference: 'both',
        type: 'podcast',
        podcast_feed_url: feedUrl,
        created_at: nowIso,
        updated_at: nowIso,
      },
    ];
    db.episodes = [
      ...db.episodes,
      ...fixture.episodes.map((ep) => ({
        id: `ep-${ep.guid}`,
        channel_id: channelId,
        external_id: ep.guid,
        title: ep.title,
        podcast_guid: ep.guid,
        audio_url: '/mock-media/generic-audio.wav',
        duration_seconds: ep.duration_seconds,
        published_at: ep.published_at,
        is_downloaded: false,
        progress_seconds: 0,
        created_at: nowIso,
        updated_at: nowIso,
      })),
    ];
    return { channel_id: channelId, title: fixture.result.title, new_episodes: fixture.episodes.length };
  },

  // Channels / instances / smart links / history
  list: () =>
    db.channels.map((c) => ({
      ...c,
      // Mirrors home_url_for: video channels link to their YouTube id;
      // podcast channels get a link only when a site link exists (the
      // fixtures carry none, so they honestly have none).
      home_url: c.type === 'podcast' ? undefined : `https://www.youtube.com/channel/${c.external_id}`,
    })),
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

  // Smart-link review (2c wiring; mirrors the Rust commands from 1d):
  // confirm flips user_confirmed, unlink deletes, both ERROR on an unknown
  // id rather than silently succeeding.
  confirm_smart_link: (args): null => {
    const linkId = args?.linkId as string | undefined;
    const confirmed = args?.confirmed as boolean | undefined;
    const link = db.smartLinks.find((l) => l.id === linkId);
    if (!link) throw new Error(`mock: episode link not found: ${linkId}`);
    link.user_confirmed = Boolean(confirmed);
    link.updated_at = new Date().toISOString();
    return null;
  },
  unlink_smart_link: (args): null => {
    const linkId = args?.linkId as string | undefined;
    const before = db.smartLinks.length;
    db.smartLinks = db.smartLinks.filter((l) => l.id !== linkId);
    if (db.smartLinks.length === before) {
      throw new Error(`mock: episode link not found: ${linkId}`);
    }
    return null;
  },
  // The real matcher needs the Rust backend (episodes table + scoring).
  // The mock reports what it can honestly compute: nothing is newly paired
  // here, so a dev build sees "0 matched" rather than invented links.
  match_episodes: () => ({ matched_count: 0 }),

  // 2c screen wiring: channels unsubscribe, history clear, downloads
  // list/cancel/delete. Same semantics as the Rust commands.
  unsubscribe: (args): null => {
    const channelId = args?.channelId as string | undefined;
    const before = db.channels.length;
    db.channels = db.channels.filter((c) => c.id !== channelId);
    if (db.channels.length === before) {
      throw new Error(`mock: channel not found: ${channelId}`);
    }
    return null;
  },
  clear_history: (): null => {
    db.history = [];
    return null;
  },
  // Live-test pass: history records one row per actual playback start
  // (mirrors the Rust record_history; the player calls it after a
  // successful stream resolve).
  record_history: (args) => {
    const episode = requireEpisode(args?.episodeId as string);
    const entry = {
      id: crypto.randomUUID(),
      user_id: 'current-user',
      episode_id: episode.id,
      position_seconds: 0,
      duration_seconds: episode.duration_seconds,
      completed: false,
      played_at: new Date().toISOString(),
    };
    db.history = [entry, ...db.history];
    return entry;
  },
  list_downloads: (args): Download[] => {
    const status = args?.status as string | undefined;
    return db.downloads.filter((d) => !status || status === 'all' || d.status === status);
  },
  cancel_download: (args): null => {
    const id = args?.id as string | undefined;
    const dl = db.downloads.find((d) => d.id === id);
    if (!dl) throw new Error(`mock: download not found: ${id}`);
    dl.status = 'cancelled';
    return null;
  },
  delete_download: (args): null => {
    const id = args?.id as string | undefined;
    const before = db.downloads.length;
    db.downloads = db.downloads.filter((d) => d.id !== id);
    if (db.downloads.length === before) {
      throw new Error(`mock: download not found: ${id}`);
    }
    return null;
  },

  // Play-mode rules (D7): (channel, title-pattern) → default play mode.
  // Mirrors the Rust commands: upsert on (channel_id, title_pattern), modes
  // limited to video|audio, removal by id is idempotent.
  list_play_mode_rules: (args): PlayModeRule[] => {
    const channelId = args?.channelId as string | undefined;
    return db.playModeRules
      .filter((r) => !channelId || r.channel_id === channelId)
      .sort((a, b) => b.priority - a.priority || a.created_at.localeCompare(b.created_at));
  },
  set_play_mode_rule: (args): PlayModeRule => {
    const channelId = args?.channelId as string | undefined;
    const titlePattern = args?.titlePattern as string | undefined;
    const playMode = args?.playMode as PlayModeRule['play_mode'] | undefined;
    if (!channelId) throw new Error('mock: channelId is required');
    if (!titlePattern) throw new Error('mock: titlePattern is required');
    if (playMode !== 'video' && playMode !== 'audio') {
      throw new Error("mock: playMode must be 'video' or 'audio'");
    }
    const priority = typeof args?.priority === 'number' ? args.priority : 0;
    const now = new Date().toISOString();
    const existing = db.playModeRules.find(
      (r) => r.channel_id === channelId && r.title_pattern === titlePattern
    );
    if (existing) {
      existing.play_mode = playMode;
      existing.priority = priority;
      existing.updated_at = now;
      return { ...existing };
    }
    const rule: PlayModeRule = {
      id: `rule-${crypto.randomUUID().slice(0, 8)}`,
      channel_id: channelId,
      title_pattern: titlePattern,
      play_mode: playMode,
      priority,
      created_at: now,
      updated_at: now,
    };
    db.playModeRules = [...db.playModeRules, rule];
    return { ...rule };
  },
  remove_play_mode_rule: (args) => {
    const ruleId = args?.ruleId as string | undefined;
    db.playModeRules = db.playModeRules.filter((r) => r.id !== ruleId);
  },

  // Settings
  get_settings: (): UserPreferences => ({ ...db.preferences }),
  update_settings: (args) => {
    const prefs = (args?.prefs ?? {}) as Partial<UserPreferences>;
    db.preferences = { ...db.preferences, ...prefs };
  },

  // Crash reporting (4f): capture is local-only; one fixture record so the
  // Settings section is exercisable in the mock world.
  get_crash_reports: (): CrashRecord[] => crashRecords,
  clear_crash_reports: (): null => {
    crashRecords = [];
    return null;
  },
  log_frontend_error: (args): null => {
    crashRecords.push({
      kind: String(args?.kind ?? 'js-error'),
      signature: `mock-${crashRecords.length + 1}`,
      message: String(args?.message ?? ''),
      app_version: '0.1.0',
      at: new Date().toISOString(),
    });
    return null;
  },
  open_external_url: (args) => `mock: would open ${String(args?.url ?? '')}`,

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
