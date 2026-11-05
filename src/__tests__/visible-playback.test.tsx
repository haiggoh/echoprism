// @vitest-environment jsdom
/**
 * Round 6 Task 3 [echoprism-visible-playback-and-restore]: "choosing a video
 * to play now by clicking on the play button inside the thumbnail should
 * always play the video visibly not just in the background. if a video ever
 * is in the background, clicking the thumbnail or title of the video on the
 * bottom left should bring it back."
 *
 * Entry-point trace (2026-11-05): every card / directory "Play now" button
 * funnels into useEpisodePlay.handlePlayNow, which navigates to
 * /player/:id; the queue row and the playlist Play navigate too. The defect
 * rows are the MiniPlayer's bottom-left thumbnail and title — not clickable,
 * so a video playing in the background cannot be brought back by clicking
 * them. These tests pin every entry point to the ONE shared path.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import type { ReactElement } from 'react';
import { PlayerProvider } from '../components/PlayerProvider';
import { ConvergenceProvider } from '../hooks/useConvergence';
import { MiniPlayer } from '../components/MiniPlayer';
import { Toaster } from '../components/ui/Toaster';
import { EpisodeCard } from '../components/feed/EpisodeCard';
import { PodcastDirectorySection } from '../components/search/PodcastDirectorySection';
import { QueueScreen } from '../components/screens/QueueScreen';
import { useEpisodePlay } from '../hooks/useEpisodePlay';
import { channelCommands, episodeCommands, historyCommands, podcastCommands } from '../hooks/useTauriCommands';
import { usePlayerStore } from '../store/slices/playerSlice';
import { useQueueStore } from '../store/slices/queueSlice';
import { resetMockState } from '../mocks/router';
import type { Episode, HistoryEntry, PodcastSearchResult, SubscribedPodcast } from '../types';

const videoEp = (id: string): Episode => ({
  id,
  channel_id: 'ch-x',
  external_id: id,
  title: `Video ${id}`,
  video_id: `yt-${id}`,
  is_downloaded: false,
  progress_seconds: 0,
  created_at: '2026-11-05T00:00:00Z',
  updated_at: '2026-11-05T00:00:00Z',
});

const podcastEp = (id: string): Episode => ({
  id,
  channel_id: 'ch-p',
  external_id: id,
  title: `Podcast ${id}`,
  podcast_guid: `guid-${id}`,
  is_downloaded: false,
  progress_seconds: 0,
  created_at: '2026-11-05T00:00:00Z',
  updated_at: '2026-11-05T00:00:00Z',
});

/** Stands in for PlayerScreen, so reaching /player/:id is observable. */
function PlayerMarker() {
  const { episodeId } = useParams();
  return <div data-testid="at-player">{episodeId}</div>;
}

function renderApp(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <PlayerProvider>
          <ConvergenceProvider>
            <Routes>
              <Route path="/" element={ui} />
              <Route path="/player/:episodeId" element={<PlayerMarker />} />
            </Routes>
          </ConvergenceProvider>
        </PlayerProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Wires an EpisodeCard through the ONE shared play-now path, like the screens do. */
function CardProbe({ episode }: { episode: Episode }) {
  const { handlePlayNow } = useEpisodePlay();
  return (
    <EpisodeCard
      episode={episode}
      onClick={() => {}}
      onQueue={() => {}}
      onPlayNow={() => handlePlayNow(episode)}
      queueBehavior="play_next"
    />
  );
}

async function cardFor(title: string): Promise<HTMLElement> {
  const el = await screen.findByText(title);
  return el.closest('article') as HTMLElement;
}

const atPlayer = async (id: string) => {
  const marker = await screen.findByTestId('at-player');
  await waitFor(() => expect(marker.textContent).toBe(id));
};

beforeAll(() => {
  window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve()) as unknown as HTMLMediaElement['play'];
  window.HTMLMediaElement.prototype.pause = vi.fn() as unknown as HTMLMediaElement['pause'];
});

beforeEach(() => {
  resetMockState();
  vi.spyOn(historyCommands, 'record').mockResolvedValue({} as HistoryEntry);
  useQueueStore.setState({ items: [], currentIndex: 0, repeatMode: 'off', shuffle: false });
  usePlayerStore.setState({ isPlaying: false, playbackState: null, isAudioMode: false });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Round 6 Task 3: every Play-now entry point opens the player visibly', () => {
  it('the thumbnail-overlay Play now on a video card navigates to /player/<id>', async () => {
    renderApp(<CardProbe episode={videoEp('ep-v1')} />);
    const card = await cardFor('Video ep-v1');
    const overlay = within(card)
      .getAllByRole('button', { name: 'Play now' })
      .find((b) => !b.className.includes('btn-sm')) as HTMLElement;
    expect(overlay, 'the center overlay is its own Play now button').toBeTruthy();
    await act(async () => { fireEvent.click(overlay); });
    await atPlayer('ep-v1');
  });

  it('the action-bar Play now navigates to /player/<id>', async () => {
    renderApp(<CardProbe episode={videoEp('ep-v2')} />);
    const card = await cardFor('Video ep-v2');
    const bar = within(card)
      .getAllByRole('button', { name: 'Play now' })
      .find((b) => b.className.includes('btn-sm')) as HTMLElement;
    expect(bar, 'the action-bar Play now button exists').toBeTruthy();
    await act(async () => { fireEvent.click(bar); });
    await atPlayer('ep-v2');
  });

  it('Review Focus 4: a podcast episode (no video) played via the thumbnail still navigates to the player', async () => {
    renderApp(<CardProbe episode={podcastEp('ep-p1')} />);
    const card = await cardFor('Podcast ep-p1');
    const overlay = within(card)
      .getAllByRole('button', { name: 'Play now' })
      .find((b) => !b.className.includes('btn-sm')) as HTMLElement;
    await act(async () => { fireEvent.click(overlay); });
    await atPlayer('ep-p1');
  });

  it('the podcast-directory Play now navigates to /player/<id>', async () => {
    const RESULT: PodcastSearchResult = {
      feed_url: 'https://feeds.example.org/x.xml',
      title: 'X Show',
      author: 'X',
      artwork: '',
      genres: [],
    };
    vi.spyOn(podcastCommands, 'search').mockResolvedValue([RESULT]);
    vi.spyOn(channelCommands, 'list').mockResolvedValue([]);
    vi.spyOn(podcastCommands, 'subscribe').mockResolvedValue({
      channel_id: 'ch-x2',
      title: 'X Show',
      new_episodes: 1,
    } as SubscribedPodcast);
    vi.spyOn(episodeCommands, 'feed').mockResolvedValue([podcastEp('ep-pod-9')]);

    renderApp(<PodcastDirectorySection query="x show" />);
    const sub = await screen.findByRole('button', { name: /subscribe to x show/i });
    await act(async () => { fireEvent.click(sub); });
    const play = await screen.findByRole('button', { name: 'Play now' });
    await act(async () => { fireEvent.click(play); });
    await atPlayer('ep-pod-9');
  });

  it('clicking a queue row navigates to /player/<id>', async () => {
    const ep = videoEp('ep-q1');
    useQueueStore.setState({
      items: [
        {
          id: 'qi-1',
          queue_id: 'local',
          episode_id: ep.id,
          added_at: '',
          source: 'feed',
          play_mode: 'unified',
          position: 0,
          episode: ep,
        },
      ],
      currentIndex: 0,
    });
    renderApp(<QueueScreen />);
    const row = await screen.findByRole('button', { name: /play video ep-q1/i });
    await act(async () => { fireEvent.click(row); });
    await atPlayer('ep-q1');
  });
});

describe('Round 6 Task 3: the mini player brings a backgrounded video back', () => {
  function renderMini() {
    const ep = videoEp('ep-bg-1');
    useQueueStore.setState({
      items: [
        {
          id: 'qi-bg',
          queue_id: 'local',
          episode_id: ep.id,
          added_at: '',
          source: 'feed',
          play_mode: 'unified',
          position: 0,
          episode: ep,
        },
      ],
      currentIndex: 0,
    });
    return renderApp(
      <>
        <MiniPlayer />
        <Toaster />
      </>,
    );
  }

  it('clicking the bottom-left thumbnail is a real button that navigates to /player/<id>', async () => {
    renderMini();
    const thumb = await screen.findByRole('button', { name: /open player artwork/i });
    await act(async () => { fireEvent.click(thumb); });
    await atPlayer('ep-bg-1');
  });

  it('clicking the bottom-left title is a real button that navigates to /player/<id>', async () => {
    renderMini();
    const title = await screen.findByRole('button', { name: /open player: video ep-bg-1/i });
    await act(async () => { fireEvent.click(title); });
    await atPlayer('ep-bg-1');
  });
});
