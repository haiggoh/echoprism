// @vitest-environment jsdom
/**
 * Phase E: the hover-preview contract. The research settled the cost model
 * (a STORYBOARD sprite, one source call per NEW hovered video id, LRU ~8,
 * delay 600ms, leave destroys everything) and the owner's unplug
 * requirement makes PREVIEW_ENABLED=false a TESTED assertion, not a hope.
 *
 * Discriminants: breaking the leave-cancel fails the no-churn assertion;
 * a second spec call for the same id fails the LRU assertion; re-enabling
 * previews for podcast rows fails the idle assertion.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { EpisodeCard } from '../components/feed/EpisodeCard';
import { StoryboardLru, previewCapability, previewConfig, PREVIEW_DELAY_MS } from '../hooks/useHoverPreview';
import { previewCommands } from '../hooks/useTauriCommands';
import { resetMockState } from '../mocks/router';
import type { Episode, StoryboardSpec } from '../types';

const spec: StoryboardSpec = {
  urls: ['data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"/>'],
  frame_width: 160,
  frame_height: 90,
  frames_per_page_x: 2,
  frames_per_page_y: 2,
  duration_per_frame_ms: 300,
  total_count: 4,
};

function makeEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: 'ep-1',
    channel_id: 'ch-1',
    external_id: 'yt-video-1',
    title: 'A video episode',
    video_id: 'yt-video-1',
    is_downloaded: false,
    progress_seconds: 0,
    created_at: '2026-10-23T00:00:00Z',
    updated_at: '2026-10-23T00:00:00Z',
    ...overrides,
  };
}

// --- pure mechanics ---

describe('StoryboardLru (the cost bound)', () => {
  it('evicts the least recently used beyond the cap and refreshes on get', () => {
    const lru = new StoryboardLru();
    for (let i = 0; i < 8; i += 1) lru.put(`v${i}`, spec);
    expect(lru.size).toBe(8);
    lru.get('v0'); // refresh v0's recency
    lru.put('v8', spec); // evicts v1 (the LRU), NOT v0
    expect(lru.get('v0')).toBeDefined();
    expect(lru.get('v1')).toBeUndefined();
    expect(lru.size).toBe(8);
  });
});

describe('previewCapability (2b bar)', () => {
  it('disables under reduced motion and for coarse pointers', () => {
    const reduced = vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({
      matches: q === '(prefers-reduced-motion: reduce)',
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList);
    expect(previewCapability()).toBe(false);
    reduced.mockRestore();
  });
});

// --- wiring on the real card (mock world: preview_frames returns a sprite) ---

function renderCard(episode: Episode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <EpisodeCard episode={episode} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  resetMockState();
  // jsdom has no matchMedia; the capability gate needs hover:fine TRUE and
  // reduced-motion FALSE for the default path.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
      matches: q.includes('hover: hover'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('EpisodeCard hover preview (Phase E)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('shows the sprite overlay after the delay and destroys it on leave', async () => {
    const framesSpy = vi.spyOn(previewCommands, 'frames').mockResolvedValue(spec);
    renderCard(makeEpisode());

    const thumb = document.querySelector('.aspect-video') as HTMLElement;
    fireEvent.pointerEnter(thumb);
    // Before the delay: nothing.
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS - 1);
    expect(screen.queryByTestId('episode-preview')).toBeNull();
    // Only after the full delay does the source call happen — ONCE.
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(screen.getByTestId('episode-preview')).toBeTruthy());

    // Leave destroys the overlay entirely.
    fireEvent.pointerLeave(thumb);
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.queryByTestId('episode-preview')).toBeNull();

    // Re-hover within the LRU: NO second source call (one call per NEW id).
    fireEvent.pointerEnter(thumb);
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS);
    await vi.waitFor(() => expect(screen.getByTestId('episode-preview')).toBeTruthy());
    expect(framesSpy).toHaveBeenCalledTimes(1);
  });

  it('stays idle for podcast-shaped episodes (no video_id — nothing invented)', async () => {
    const framesSpy = vi.spyOn(previewCommands, 'frames').mockResolvedValue(spec);
    renderCard(makeEpisode({ video_id: undefined, audio_url: '/mock-media/ep-pod-1.wav' }));
    const thumb = document.querySelector('.aspect-video') as HTMLElement;
    fireEvent.pointerEnter(thumb);
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS + 50);
    expect(framesSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('episode-preview')).toBeNull();
  });

  it('THE UNPLUG TEST: previews are absent when the feature is switched off', async () => {
    vi.spyOn(previewCommands, 'frames').mockResolvedValue(spec);
    const original = previewConfig.enabled;
    previewConfig.enabled = false; // the same act as unplugging in production
    try {
      renderCard(makeEpisode());
      const thumb = document.querySelector('.aspect-video') as HTMLElement;
      fireEvent.pointerEnter(thumb);
      await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS + 50);
      expect(screen.queryByTestId('episode-preview')).toBeNull();
    } finally {
      previewConfig.enabled = original;
    }
  });
});
