// @vitest-environment jsdom
/**
 * Parity audit batch 3, Task 5 — owner, 2026-11-02: "default behavior is add
 * to queue as play next and the button to play now (without discarding the
 * queue either exists) but I want the user to be able to choose the
 * alternate styles if they want it from inside a settings panel."
 *
 * Measured before: the default 'auto' played when idle and silently queued
 * when busy (one click, two behaviours); play-now APPENDED to the queue's end
 * so the remaining queue ended up behind the cursor; the queue-only "Next"
 * button wore a ▶ play glyph; channel-page cards had no handlers at all.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PlayerProvider } from '../components/PlayerProvider';
import { FeedScreen } from '../components/screens/FeedScreen';
import { historyCommands, settingsCommands } from '../hooks/useTauriCommands';
import { usePlayerStore } from '../store/slices/playerSlice';
import { useQueueStore } from '../store/slices/queueSlice';
import { resetMockState } from '../mocks/router';
import type { Episode, HistoryEntry, QueueItem, UserPreferences } from '../types';

const ep = (id: string): Episode => ({
  id,
  channel_id: 'ch-x',
  external_id: id,
  title: `Queued ${id}`,
  video_id: `yt-${id}`,
  is_downloaded: false,
  progress_seconds: 0,
  created_at: '2026-10-19T00:00:00Z',
  updated_at: '2026-10-19T00:00:00Z',
});
const item = (e: Episode, i: number): QueueItem => ({
  id: `qi-${e.id}`, queue_id: 'local', episode_id: e.id, added_at: '', source: 'feed', play_mode: 'unified', position: i, episode: e,
});

async function withPrefs(patch: Partial<UserPreferences>) {
  const base = await settingsCommands.get();
  vi.spyOn(settingsCommands, 'get').mockResolvedValue({ ...base, ...patch });
}

function renderFeed() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/feed']}>
        <PlayerProvider>
          <Routes>
            <Route path="/feed" element={<FeedScreen />} />
            <Route path="/player/:episodeId" element={<div>player</div>} />
          </Routes>
        </PlayerProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The feed card for the fixture video "How Invidious pools actually work". */
async function card() {
  const title = await screen.findByText(/How Invidious pools actually work/);
  return title.closest('article') as HTMLElement;
}

const queueIds = () => useQueueStore.getState().items.map((it) => it.episode?.id);

beforeAll(() => {
  window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve()) as unknown as HTMLMediaElement['play'];
  window.HTMLMediaElement.prototype.pause = vi.fn() as unknown as HTMLMediaElement['pause'];
});
beforeEach(() => {
  resetMockState();
  vi.spyOn(historyCommands, 'record').mockResolvedValue({} as HistoryEntry);
  const [a, b, c] = [ep('a'), ep('b'), ep('c')];
  useQueueStore.setState({ items: [item(a, 0), item(b, 1), item(c, 2)], currentIndex: 0, repeatMode: 'off', shuffle: false });
  usePlayerStore.setState({ isPlaying: false, playbackState: null, isAudioMode: false });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Card click: play next by default, a real Play now (owner decision 2026-11-02)', () => {
  it('the DEFAULT click queues the episode right after the current item and does not start playback', async () => {
    renderFeed();
    const c = await card();
    await waitFor(() => expect(c).toBeTruthy());
    await act(async () => {
      fireEvent.click(within(c).getByText(/How Invidious pools actually work/));
    });
    await waitFor(() => expect(queueIds()).toEqual(['a', 'ep-video-1', 'b', 'c']));
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  it('the default click honours Queue behavior = Add to end', async () => {
    await withPrefs({ queue_behavior: 'add_end' });
    renderFeed();
    const c = await card();
    // Let the preferences query land before clicking (the click reads it).
    await waitFor(() => expect(settingsCommands.get).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(within(c).getByText(/How Invidious pools actually work/));
    });
    await waitFor(() => expect(queueIds()).toEqual(['a', 'b', 'c', 'ep-video-1']));
  });

  it('Play now plays it immediately WITHOUT discarding the queue: inserted AT the cursor, in front of the current item', async () => {
    // Premise updated 2026-11-02 batch 4 (owner answer): play now inserts at
    // the cursor (before the current item), not after it — the old
    // currentIndex+1 insert was the previous contract.
    renderFeed();
    const c = await card();
    await act(async () => {
      fireEvent.click(within(c).getByRole('button', { name: 'Play now' }));
    });
    await waitFor(() => expect(usePlayerStore.getState().isPlaying).toBe(true));
    expect(queueIds()).toEqual(['ep-video-1', 'a', 'b', 'c']);
    expect(useQueueStore.getState().currentIndex).toBe(0);
  });

  it('Play now with an EMPTY queue makes it the only item and plays it (Review Focus 3)', async () => {
    useQueueStore.setState({ items: [], currentIndex: 0 });
    renderFeed();
    const c = await card();
    await act(async () => {
      fireEvent.click(within(c).getByRole('button', { name: 'Play now' }));
    });
    await waitFor(() => expect(usePlayerStore.getState().isPlaying).toBe(true));
    expect(queueIds()).toEqual(['ep-video-1']);
    expect(useQueueStore.getState().currentIndex).toBe(0);
  });

  it('the alternate style chosen in Settings applies: Play now on click', async () => {
    await withPrefs({ card_click_action: 'play_now' });
    renderFeed();
    const c = await card();
    await waitFor(() => expect(settingsCommands.get).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(within(c).getByText(/How Invidious pools actually work/));
    });
    await waitFor(() => expect(usePlayerStore.getState().isPlaying).toBe(true));
    expect(queueIds()).toEqual(['ep-video-1', 'a', 'b', 'c']);
  });

  it('"Play next" is a queue action and no longer wears the ▶ play glyph', async () => {
    renderFeed();
    const c = await card();
    const next = within(c).getByRole('button', { name: 'Play next' });
    expect(next.querySelector('polygon[points="5 3 19 12 5 21 5 3"]'), 'the play triangle belongs to Play now').toBeNull();
    await act(async () => {
      fireEvent.click(next);
    });
    expect(queueIds()).toEqual(['a', 'ep-video-1', 'b', 'c']);
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });
});
