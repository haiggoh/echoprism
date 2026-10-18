import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usePlayer } from '../components/PlayerProvider';
import { useQueueStore } from '../store/slices/queueSlice';
import { useToasts } from '../components/ui/Toaster';
import { settingsCommands } from './useTauriCommands';
import type { Episode, QueueItem } from '../types';

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
 * D7 (per-title-family play mode) consults its rule chain here in Phase 3:
 * title rule → channel format_preference → D2.
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
    play(episode);
    navigate(`/player/${episode.id}`);
  };

  return { handleCardClick, handleQueue };
}
