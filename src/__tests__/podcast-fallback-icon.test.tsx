// @vitest-environment jsdom
/**
 * The default podcast artwork: an episode with no thumbnail shows a solid
 * headphones silhouette (🎧's shape), not the old hand-pasted path that
 * rendered as stroked scribbles. Video episodes keep their own glyph, so the
 * icon still tells the two apart.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { EpisodeCard } from '../components/feed/EpisodeCard';
import type { Episode } from '../types';

function makeEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: 'ep-1',
    channel_id: 'ch-1',
    external_id: 'ext-1',
    title: 'An episode',
    is_downloaded: false,
    progress_seconds: 0,
    created_at: '2026-10-27T00:00:00Z',
    updated_at: '2026-10-27T00:00:00Z',
    ...overrides,
  };
}

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

afterEach(cleanup);

describe('default podcast artwork', () => {
  it('an audio episode without a thumbnail shows the filled headphones silhouette', () => {
    renderCard(makeEpisode({ audio_url: 'https://example.dev/ep.mp3' }));
    const icon = screen.getByTestId('podcast-fallback-icon');
    // A silhouette is FILLED: the old icon was a stroked path, which is what
    // made it read as scribbles.
    expect(icon.getAttribute('fill')).toBe('currentColor');
    expect(icon.getAttribute('stroke')).toBeNull();
    // ...and it is the ONLY glyph in the fallback slot (no video triangle).
    expect(icon.parentElement?.querySelectorAll('svg')).toHaveLength(1);
  });

  it('DISCRIMINANT: a video episode without a thumbnail does NOT get the podcast icon', () => {
    renderCard(makeEpisode({ video_id: 'yt-1' }));
    expect(screen.queryByTestId('podcast-fallback-icon')).toBeNull();
  });
});
