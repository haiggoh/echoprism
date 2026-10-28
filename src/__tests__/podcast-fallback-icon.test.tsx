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

/**
 * Live-test Task 9: "the headphone icon works now, but I know these podcasts
 * normally should have real cover images, we need those displayed there."
 *
 * The card only looked at `episode.thumbnail_url`, so a podcast episode
 * without its own `<itunes:image>` showed the headphones silhouette even when
 * its CHANNEL publishes cover art — which is the normal case. Task 2 shipped
 * `Episode.channel`, so the channel's art is available at read time and the
 * card must use it before falling back.
 *
 * Discriminants: reverting the card to `episode.thumbnail_url` alone fails the
 * second test; removing the headphones branch entirely fails the third.
 */
const channelArt = {
  id: 'ch-1',
  title: 'Some More News',
  thumbnail_url: 'https://img.example/smn-show-art.jpg',
  type: 'podcast' as const,
};

describe('Live-test Task 9: channel cover art before the headphones fallback', () => {
  it("an episode without its own art shows the CHANNEL's art", () => {
    renderCard(
      makeEpisode({
        audio_url: 'https://example.dev/ep.mp3',
        channel: channelArt,
      }),
    );
    const art = screen.getByTestId('episode-art') as HTMLImageElement;
    // The channel's cover is rendered, not the headphones glyph.
    expect(art.getAttribute('src')).toBe(channelArt.thumbnail_url);
    expect(screen.queryByTestId('podcast-fallback-icon')).toBeNull();
  });

  it("an episode's OWN art wins over the channel's", () => {
    renderCard(
      makeEpisode({
        audio_url: 'https://example.dev/ep.mp3',
        thumbnail_url: 'https://img.example/episode-art.jpg',
        channel: channelArt,
      }),
    );
    const art = screen.getByTestId('episode-art') as HTMLImageElement;
    expect(art.getAttribute('src')).toBe('https://img.example/episode-art.jpg');
  });

  it('the headphones icon remains when NEITHER the episode nor the channel has art', () => {
    // Review Focus 5: nothing invented, and no broken <img src="">.
    renderCard(
      makeEpisode({
        audio_url: 'https://example.dev/ep.mp3',
        channel: { id: 'ch-1', title: 'Some More News', type: 'podcast' as const },
      }),
    );
    expect(screen.getByTestId('podcast-fallback-icon')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });
});
