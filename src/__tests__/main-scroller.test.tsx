// @vitest-environment jsdom
/**
 * Round 9 (echoprism-ui-the-play-bar): the fixed mini player (~67px) covered
 * the page's last row — the owner could not scroll a channel page's Subscribe
 * button into view. MainScroller pads the scroll container by the bar's height
 * WHILE an episode is loaded (the bar's own visibility condition) and leaves
 * idle pages unpadded. The conditional is the discriminant: an unconditional
 * padding class fails the idle assertion, a missing one fails the loaded one.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PlayerProvider, usePlayer } from '../components/PlayerProvider';
import { MainScroller } from '../App';
import { episodeCommands } from '../hooks/useTauriCommands';
import { resetMockState } from '../mocks/router';
import type { Episode } from '../types';

let api: ReturnType<typeof usePlayer>;

function Probe() {
  api = usePlayer();
  return null;
}

function episode(): Episode {
  return {
    id: 'ep-pad-1',
    channel_id: 'ch-1',
    external_id: 'ep-pad-1',
    title: 'A padded episode',
    video_id: 'yt-ep-pad-1',
    is_downloaded: false,
    progress_seconds: 0,
    created_at: '2026-11-13T00:00:00Z',
    updated_at: '2026-11-13T00:00:00Z',
  } satisfies Episode;
}

function renderScroller() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PlayerProvider>
          <MainScroller>
            <Probe />
          </MainScroller>
        </PlayerProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve()) as unknown as HTMLMediaElement['play'];
  window.HTMLMediaElement.prototype.pause = vi.fn() as unknown as HTMLMediaElement['pause'];
});

beforeEach(() => resetMockState());
afterEach(cleanup);

const mainEl = () => {
  const el = document.getElementById('main-content');
  if (!el) throw new Error('#main-content missing');
  return el;
};

describe('MainScroller: the scroll container clears the fixed play bar', () => {
  it('an idle page has NO bottom padding', () => {
    renderScroller();
    expect(mainEl().className).not.toMatch(/pb-\[/);
  });

  it('a loaded episode pads the scroller by the bar height', async () => {
    const stream = vi.spyOn(episodeCommands, 'stream').mockImplementation((id: string, format?: string) =>
      Promise.resolve({ url: `https://mock/${format ?? 'video'}/${id}.m3u8`, format: format ?? 'video' }));
    renderScroller();
    await waitFor(() => expect(api).toBeDefined());
    await act(async () => { api.play(episode()); });
    await waitFor(() => {
      expect(mainEl().className).toContain('pb-[68px]');
    });
    stream.mockRestore();
  });
});
