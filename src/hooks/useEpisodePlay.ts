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
 * Card-click behavior, shared by Feed, Search and Channel pages.
 *
 * Owner decision 2026-11-02 (supersedes D2's 'auto' default — "one click, two
 * behaviours" depending on whether something was playing):
 *   - 'queue' (default): add to the queue at the Queue-behavior position —
 *     Play next by default — and never interrupt what is playing;
 *   - 'play_now': play it now, WITHOUT discarding the queue;
 *   - 'load_paused': open it in the player, paused.
 * Every card also carries explicit Play now / Play next / Add to end buttons,
 * so each style is one click away whichever is the click default.
 *
 * D7: the play paths resolve the per-title-family default first
 * (title rule → channel format_preference → none) and hand it to the engine.
 */
export function useEpisodePlay() {
  const navigate = useNavigate();
  const { addItem, playNextItem, playNowItem } = useQueueStore();
  const { play, load } = usePlayer();
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

  /** Play now: the clip is inserted AT the cursor (batch 4, owner answer) —
   *  in front of the current item — and the rest of the queue keeps its order. */
  const handlePlayNow = (episode: Episode) => {
    playNowItem(queueItemFromEpisode(episode));
    play(episode, resolveDefaultPlayMode(episode, playModeRules, channels));
    navigate(`/player/${episode.id}`);
  };

  const handleCardClick = (episode: Episode) => {
    const action = preferences?.card_click_action ?? 'queue';
    if (action === 'play_now') {
      handlePlayNow(episode);
      return;
    }
    if (action === 'load_paused') {
      // The D7 chain mode travels with the load so the later play resolves
      // the rule's format rather than the global toggle's (D2×D7).
      load(episode, {
        paused: true,
        mode: resolveDefaultPlayMode(episode, playModeRules, channels),
      });
      navigate(`/player/${episode.id}`);
      return;
    }
    handleQueue(preferences?.queue_behavior === 'add_end' ? 'add_end' : 'play_next', episode);
  };

  return {
    handleCardClick,
    handleQueue,
    handlePlayNow,
    /** The single queue button on cards follows this Settings choice. */
    queueBehavior: preferences?.queue_behavior === 'add_end' ? ('add_end' as const) : ('play_next' as const),
  };
}
