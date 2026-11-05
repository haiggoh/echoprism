// @vitest-environment jsdom
/**
 * Round 6 Task 4 [echoprism-play-triangle-centre]: "the play button triangle
 * looks off center."
 *
 * Math: in the 24x24 viewBox the old triangle points="5 3 19 12 5 21 5 3"
 * is bounding-box centred at x=12 but its CENTROID is at
 * (5+19+5)/3 ≈ 9.67, so it reads left-shifted. The fix shifts it right:
 * points="7 3 21 12 7 21" has centroid (7+21+7)/3 ≈ 11.67 — optically
 * centred — at the same size. Every play-triangle site must use it (one
 * shared PlayIcon for the filled glyphs).
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactElement } from 'react';
import { PlayIcon } from '../components/ui/PlayIcon';
import { EpisodeCard } from '../components/feed/EpisodeCard';
import { QueueItemComponent } from '../components/queue/QueueItem';
import { MiniPlayer } from '../components/MiniPlayer';
import { PlayerProvider } from '../components/PlayerProvider';
import { ConvergenceProvider } from '../hooks/useConvergence';
import { Toaster } from '../components/ui/Toaster';
import { PodcastDirectorySection } from '../components/search/PodcastDirectorySection';
import { useEpisodePlay } from '../hooks/useEpisodePlay';
import { channelCommands, episodeCommands, historyCommands, podcastCommands } from '../hooks/useTauriCommands';
import { usePlayerStore } from '../store/slices/playerSlice';
import { useQueueStore } from '../store/slices/queueSlice';
import { resetMockState } from '../mocks/router';
import type { Episode, HistoryEntry, PodcastSearchResult, QueueItem, SubscribedPodcast } from '../types';

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

function centroidX(poly: Element): number {
  const nums = (poly.getAttribute('points') ?? '').trim().split(/\s+/).map(Number);
  const xs = nums.filter((_, i) => i % 2 === 0);
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function expectCentred(poly: Element, where: string) {
  const cx = centroidX(poly);
  expect(
    Math.abs(cx - 12),
    `${where}: play-triangle centroid x=${cx.toFixed(2)} must be within 0.5 of 12 (old points give 9.67)`,
  ).toBeLessThanOrEqual(0.5);
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
              <Route path="/player/:episodeId" element={<div data-testid="at-player" />} />
            </Routes>
          </ConvergenceProvider>
        </PlayerProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

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

describe('Round 6 Task 4: the play triangle is optically centred everywhere', () => {
  it('the shared PlayIcon is centred in the 24x24 viewBox', () => {
    const { container } = render(<PlayIcon size={24} />);
    const poly = container.querySelector('polygon');
    expect(poly, 'PlayIcon renders a triangle').toBeTruthy();
    expectCentred(poly as Element, 'PlayIcon');
  });

  it('both play triangles on an episode card are centred', async () => {
    renderApp(<CardProbe episode={videoEp('ep-ic-1')} />);
    const title = await screen.findByText('Video ep-ic-1');
    const card = title.closest('article') as HTMLElement;
    const polys = within(card).getAllByRole('button', { name: 'Play now' }).flatMap((b) =>
      Array.from(b.querySelectorAll('polygon')),
    );
    expect(polys.length, 'overlay + action-bar play triangles').toBe(2);
    polys.forEach((p, i) => {
      expectCentred(p, `card play triangle #${i}`);
    });
  });

  it('the queue row play triangle is centred', () => {
    const ep = videoEp('ep-ic-2');
    const item: QueueItem & { episode?: Episode } = {
      id: 'qi-ic',
      queue_id: 'local',
      episode_id: ep.id,
      added_at: '',
      source: 'feed',
      play_mode: 'unified',
      position: 0,
      episode: ep,
    };
    const { container } = render(<QueueItemComponent item={item} onPlay={() => {}} />);
    const next = screen.getByRole('button', { name: 'Play next' });
    const poly = next.querySelector('polygon');
    expect(poly).toBeTruthy();
    expectCentred(poly as Element, 'queue row play-next triangle');
    expect(container.querySelectorAll('polygon').length).toBeGreaterThan(0);
  });

  it('the mini player play button triangle is centred', async () => {
    const ep = videoEp('ep-ic-3');
    useQueueStore.setState({
      items: [
        {
          id: 'qi-mp',
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
    renderApp(
      <>
        <MiniPlayer />
        <Toaster />
      </>,
    );
    const play = await screen.findByRole('button', { name: 'Play' });
    const poly = play.querySelector('polygon');
    expect(poly, 'the paused mini player shows the play triangle').toBeTruthy();
    expectCentred(poly as Element, 'mini player play triangle');
  });

  it('the podcast-directory Play now triangle is centred', async () => {
    const RESULT: PodcastSearchResult = {
      feed_url: 'https://feeds.example.org/y.xml',
      title: 'Y Show',
      author: 'Y',
      artwork: '',
      genres: [],
    };
    vi.spyOn(podcastCommands, 'search').mockResolvedValue([RESULT]);
    vi.spyOn(channelCommands, 'list').mockResolvedValue([]);
    vi.spyOn(podcastCommands, 'subscribe').mockResolvedValue({
      channel_id: 'ch-y',
      title: 'Y Show',
      new_episodes: 1,
    } as SubscribedPodcast);
    vi.spyOn(episodeCommands, 'feed').mockResolvedValue([videoEp('ep-ic-4')]);

    renderApp(<PodcastDirectorySection query="y show" />);
    const sub = await screen.findByRole('button', { name: /subscribe to y show/i });
    await act(async () => {
      fireEvent.click(sub);
    });
    const play = await screen.findByRole('button', { name: 'Play now' });
    const poly = play.querySelector('polygon');
    expect(poly).toBeTruthy();
    expectCentred(poly as Element, 'directory play triangle');
  });
});
