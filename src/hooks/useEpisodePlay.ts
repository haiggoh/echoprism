import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usePlayer } from '../components/PlayerProvider';
import { useQueueStore } from '../store/slices/queueSlice';
import { useToasts } from '../components/ui/Toaster';
import { channelCommands, playModeRuleCommands, settingsCommands } from './useTauriCommands';
import { resolveDefaultPlayMode } from '../lib/playModeChain';
import type { Episode, QueueItem } from '../types';

// Re-exported so existing consumers (and the D7 test) keep importing it from
// here; the implementation lives in lib/playModeChain, which is what breaks the
// PlayerProvider <-> useEpisodePlay cycle — the engine needs the same chain for
// queue advance (Phase 5) and could not import it from a hook that imports it.
export { resolveDefaultPlayMode };

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
      // The D7 chain mode travels with the load so the later play resolves
      // the rule's format rather than the global toggle's (D2×D7).
      load(episode, {
        paused: true,
        mode: resolveDefaultPlayMode(episode, playModeRules, channels),
      });
      navigate(`/player/${episode.id}`);
      return;
    }
    addItem(queueItemFromEpisode(episode));
    play(episode, resolveDefaultPlayMode(episode, playModeRules, channels));
    navigate(`/player/${episode.id}`);
  };

  return { handleCardClick, handleQueue };
}
