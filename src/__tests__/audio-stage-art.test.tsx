// @vitest-environment jsdom
/**
 * Batch 4 items 3+4 (owner 2026-11-02): audio-only means NO VIDEO, not no
 * images — the player stage shows the episode's cover art in audio mode:
 * the podcast's itunes image, or the YouTube thumbnail for a video. With no
 * art at all it falls back to the headphones mark.
 *
 * Discriminants: a stage that always shows the glyph fails the art test; a
 * stage that drops the fallback fails the no-art test.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConvergenceProvider } from '../hooks/useConvergence';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PlayerProvider, usePlayer } from '../components/PlayerProvider';
import { MiniPlayer } from '../components/MiniPlayer';
import { PlayerScreen } from '../components/screens/PlayerScreen';
import { usePlayerStore } from '../store/slices/playerSlice';
import { useQueueStore } from '../store/slices/queueSlice';
import { resetMockState, mockInvoke } from '../mocks/router';
import * as bridge from '../tauri-bridge';
import type { Episode } from '../types';

let api: ReturnType<typeof usePlayer>;
function Capture() {
  api = usePlayer();
  return null;
}

const ART_URL = 'https://cdn.example/art-90min-podcast.jpg';

function artEpisode(id: string, withArt: boolean): Episode {
  return {
    id,
    channel_id: 'ch-1',
    external_id: id,
    title: `Episode ${id}`,
    thumbnail_url: withArt ? ART_URL : undefined,
    podcast_guid: withArt ? undefined : `guid-${id}`,
    audio_url: withArt ? undefined : `/mock-media/${id}.mp3`,
    is_downloaded: false,
    progress_seconds: 0,
    created_at: '2026-11-02T00:00:00Z',
    updated_at: '2026-11-02T00:00:00Z',
  };
}

function renderApp(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ConvergenceProvider>
        <MemoryRouter initialEntries={[path]}>
          <PlayerProvider>
            <Capture />
            <Routes>
              <Route path="/player/:episodeId" element={<PlayerScreen />} />
              <Route path="/feed" element={<div>feed</div>} />
            </Routes>
            <MiniPlayer />
          </PlayerProvider>
        </MemoryRouter>
      </ConvergenceProvider>
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve()) as unknown as HTMLMediaElement['play'];
  window.HTMLMediaElement.prototype.pause = vi.fn() as unknown as HTMLMediaElement['pause'];
});

beforeEach(() => {
  resetMockState();
  usePlayerStore.setState({ isPlaying: false, playbackState: null });
  useQueueStore.setState({ items: [], currentIndex: 0, draggedEpisode: null });
});
afterEach(cleanup);

function mockEpisode(ep: Episode) {
  return vi
    .spyOn(bridge, 'invoke')
    .mockImplementation((cmd: string, args?: Record<string, unknown>) =>
      cmd === 'get_episode' ? Promise.resolve(ep) : mockInvoke(cmd, args),
    );
}

describe('batch 4 items 3+4: cover art in audio-only mode', () => {
  it('a podcast with cover art shows the art on the stage in audio mode', async () => {
    const spy = mockEpisode(artEpisode('ep-art-1', true));
    try {
      renderApp('/player/ep-art-1');
      const ep = artEpisode('ep-art-1', true);
      await waitFor(() => expect(api).toBeDefined());
      await act(async () => {
        api.play(ep, 'audio');
      });
      await waitFor(() => {
        // Scoped to the stage — the mini player bar also renders a thumbnail <img>.
        const stage = screen.getByTestId('video-stage');
        expect(stage.querySelector(`img[src="${ART_URL}"]`)).toBeTruthy();
      });
      expect(screen.queryByTestId('audio-stage-headphones')).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it('a video in audio-only mode shows its YouTube thumbnail FULL-SIZED on the stage (owner 2026-11-03: not small and rectangular)', async () => {
    const videoEp: Episode = { ...artEpisode('ep-vid-art', false), video_id: 'yt-art-1', podcast_guid: undefined, audio_url: undefined, thumbnail_url: ART_URL };
    const spy = mockEpisode(videoEp);
    try {
      renderApp('/player/ep-vid-art');
      await waitFor(() => expect(api).toBeDefined());
      await act(async () => {
        api.play(videoEp, 'audio');
      });
      await waitFor(() => {
        const stage = screen.getByTestId('video-stage');
        const img = stage.querySelector(`img[src="${ART_URL}"]`) as HTMLImageElement;
        expect(img).toBeTruthy();
        // Full stage width, 16:9 like a YouTube thumbnail — not a small square.
        expect(img.className).toContain('w-full');
        expect(img.className).toContain('aspect-video');
        expect(img.className).not.toContain('w-40');
      });
    } finally {
      spy.mockRestore();
    }
  });

  it('an episode with no art at all falls back to the headphones mark', async () => {
    const spy = mockEpisode(artEpisode('ep-noart', false));
    try {
      renderApp('/player/ep-noart');
      await waitFor(() => expect(api).toBeDefined());
      await act(async () => {
        api.play(artEpisode('ep-noart', false), 'audio');
      });
      await waitFor(() => {
        expect(screen.getByTestId('audio-stage-headphones')).toBeTruthy();
      });
    } finally {
      spy.mockRestore();
    }
  });
});
