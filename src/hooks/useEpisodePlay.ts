import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usePlayer } from '../components/PlayerProvider';
import { useQueueStore } from '../store/slices/queueSlice';
import { useToasts } from '../components/ui/Toaster';
import { channelCommands, playModeRuleCommands, settingsCommands } from './useTauriCommands';
import type { Channel, Episode, PlayMode, PlayModeRule, QueueItem } from '../types';

export function queueItemFromEpisode(episode: Episode): Omit<QueueItem, 'id' | 'position'> {
  return {
    queue_id: 'local',
    episode_id: episode.id,
    added_at: new Date().toISOString(),
    source: 'feed',
    play_mode: 'unified',
    episode,
  };
}

/**
 * D7 (design-decisions.md) consultation chain — the default play mode for an
 * episode chosen on a card surface, in precedence order:
 *   1. the first matching per-channel play-mode rule (rules arrive
 *      priority-ordered from the backend; list order = evaluation order)
 *   2. the channel's format_preference ('both' = no override)
 *   3. undefined — no override; the engine then applies its own defaults
 *      (global audio toggle, capability fallback)
 * Pure and exported for direct testing (d7-play-mode-chain.test.tsx).
 */
export function resolveDefaultPlayMode(
  episode: Episode,
  rules: PlayModeRule[],
  channels: Channel[]
): PlayMode | undefined {
  const matched = rules.find(
    (r) => r.channel_id === episode.channel_id && episode.title.includes(r.title_pattern)
  );
  if (matched) return matched.play_mode;
  const channel = channels.find((c) => c.id === episode.channel_id);
  if (channel && channel.format_preference !== 'both') return channel.format_preference;
  return undefined;
}

/**
 * Card-click behavior, shared by Feed and Search (D2, design-decisions.md):
 * clicking a card is configurable. 'auto' (default) plays now when nothing
 * is playing and queues otherwise — never interrupting current media.
 * Queued items stream on demand (D1); nothing pre-downloads.
 *
 * D7: the play-now path resolves the per-title-family default first
 * (title rule → channel format_preference → none) and hands it to the
 * engine's mode override.
 */
export function useEpisodePlay() {
  const navigate = useNavigate();
  const { addItem, playNextItem } = useQueueStore();
  const { play, load, isPlaying } = usePlayer();
  const { addToast } = useToasts();
  const { data: preferences } = useQuery({
    queryKey: ['preferences'],
    queryFn: settingsCommands.get,
  });
  const { data: playModeRules = [] } = useQuery({
    queryKey: ['play-mode-rules'],
    queryFn: () => playModeRuleCommands.list(),
  });
  const { data: channels = [] } = useQuery({
    queryKey: ['channels', 'for-play-mode'],
    queryFn: () => channelCommands.list(),
  });

  const handleQueue = (action: 'play_next' | 'add_end', episode: Episode) => {
    if (action === 'play_next') playNextItem(queueItemFromEpisode(episode));
    else addItem(queueItemFromEpisode(episode));
    addToast({
      title: action === 'play_next' ? 'Playing next' : 'Added to end of queue',
      variant: 'success',
    });
  };

  const handleCardClick = (episode: Episode) => {
    const action = preferences?.card_click_action ?? 'auto';
    if (action === 'queue' || (action === 'auto' && isPlaying)) {
      handleQueue('add_end', episode);
      return;
    }
    if (action === 'load_paused') {
      // D2 'load_paused': the episode becomes the engine's current episode at
      // its saved position; playback starts only when the user presses play.
      load(episode, { paused: true });
      navigate(`/player/${episode.id}`);
      return;
    }
    addItem(queueItemFromEpisode(episode));
    play(episode, resolveDefaultPlayMode(episode, playModeRules, channels));
    navigate(`/player/${episode.id}`);
  };

  return { handleCardClick, handleQueue };
}
