// @vitest-environment jsdom
/**
 * Live-test batch 2, Task 2: "The video playback tends to scale too large, not
 * fitting the window size (only making the window full screen scaled the video
 * down to fit inside."
 *
 * Measured cause, two halves:
 *
 * 1. The container was `w-full aspect-video` — a box whose HEIGHT is derived
 *    from its WIDTH. On a wide window that box is taller than the space left
 *    after the title, progress bar and controls, so the video area overflows the
 *    viewport. Fullscreen coincidentally fit because a 16:9 screen matches the
 *    box's ratio.
 * 2. The <video> was `inset-0 h-full w-full` with NO object-fit, and the spec's
 *    default for object-fit is `fill` — which stretches the frame to the box and
 *    ignores the video's own aspect ratio.
 *
 * The fix: the container is a flex child that takes the space actually left
 * (flex-1 min-h-0), and the video letterboxes inside it with object-contain. The
 * video then fits at ANY window size without fullscreen, and never distorts.
 *
 * jsdom does not lay out, so this pins the CONTRACT rather than measured
 * geometry. Discriminants: dropping object-contain fails the first test;
 * restoring the aspect-video box fails the second.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PlayerScreen } from '../components/screens/PlayerScreen';
import { PlayerProvider, usePlayer } from '../components/PlayerProvider';
import { ConvergenceProvider } from '../hooks/useConvergence';
import { usePlayerStore } from '../store/slices/playerSlice';
import { useQueueStore } from '../store/slices/queueSlice';
import { resetMockState } from '../mocks/router';

function Probe() {
  const { registerVideoElement } = usePlayer();
  return <video ref={registerVideoElement} />;
}

function renderPlayer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/player/ep-video-1']}>
        <PlayerProvider>
          <ConvergenceProvider>
            <Probe />
            <Routes>
              <Route path="/player/:episodeId" element={<PlayerScreen />} />
            </Routes>
          </ConvergenceProvider>
        </PlayerProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  resetMockState();
  useQueueStore.setState({ items: [], currentIndex: 0, repeatMode: 'off', shuffle: false });
  usePlayerStore.setState({ playbackState: null, isPlaying: false });
});

afterEach(cleanup);

describe('Live-test batch 2 Task 2: the video fits the window', () => {
  it('letterboxes the video instead of stretching it to the box', async () => {
    renderPlayer();
    const video = (await waitFor(() => screen.getByTitle('video-surface'))) as HTMLVideoElement;
    // The spec default is `fill`, which distorts; `contain` preserves the
    // video's own aspect ratio inside whatever space is available.
    expect(video.className).toContain('object-contain');
    expect(video.className).not.toContain('object-fill');
  });

  it('sizes the video area from the space left, not from the video width', async () => {
    renderPlayer();
    await waitFor(() => screen.getByTitle('video-surface'));

    const stage = document.querySelector('[data-testid="video-stage"]') as HTMLElement;
    expect(stage).toBeTruthy();

    // flex-1 + min-h-0: the box shrinks to the height actually available, so a
    // wide window cannot push it past the viewport.
    expect(stage.className).toContain('flex-1');
    expect(stage.className).toContain('min-h-0');
    // The old box derived its height from its width.
    expect(stage.className).not.toContain('aspect-video');
  });
});
