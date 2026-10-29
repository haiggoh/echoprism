// @vitest-environment jsdom
/**
 * Live-test batch 2, Task 6: "only at the bottom it correctly shows me a card
 * for the some more news podcast channel under the title podcast directory but
 * it's not clickable. I should be able to click on the shows podcast directory
 * card to see inside and finde the episodes."
 *
 * Measured cause: the directory card had exactly two terminal states, and
 * neither could open the show. Unsubscribed → a Subscribe button. Subscribed →
 * a DISABLED "Subscribed ✓" button, i.e. a dead control. Episodes were only
 * listed inline for a channel subscribed DURING this session
 * (`expandedChannelId` is set by the subscribe mutation and nothing else), so
 * a channel already subscribed offered no way in at all.
 *
 * Batch 1 shipped /channels/:id and ChannelScreen, so the fix is wiring, not a
 * new screen.
 *
 * Discriminants: removing the navigation fails the first two tests; making the
 * subscribed state a dead button again fails the second.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PodcastDirectorySection } from '../components/search/PodcastDirectorySection';
import { channelCommands, podcastCommands } from '../hooks/useTauriCommands';
import { PlayerProvider } from '../components/PlayerProvider';
import { resetMockState } from '../mocks/router';
import type { Channel, PodcastSearchResult } from '../types';

const RESULT: PodcastSearchResult = {
  feed_url: 'https://feeds.example.org/smn.xml',
  title: 'Some More News',
  author: 'Some More News',
  artwork: 'https://img.example/smn.jpg',
  genres: ['News'],
};

/** Stands in for ChannelScreen, so reaching the route is observable. */
function ChannelMarker() {
  return <div data-testid="channel-screen">the channel</div>;
}

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/search']}>
        <PlayerProvider>
          <Routes>
            <Route path="/search" element={<PodcastDirectorySection query="some more news" />} />
            <Route path="/channels/:channelId" element={<ChannelMarker />} />
          </Routes>
        </PlayerProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  resetMockState();
  vi.spyOn(podcastCommands, 'search').mockResolvedValue([RESULT]);
});

afterEach(cleanup);

describe('Live-test batch 2 Task 6: the directory card opens the show', () => {
  it('clicking a subscribed show opens its channel', async () => {
    vi.spyOn(channelCommands, 'list').mockResolvedValue([
      {
        id: 'ch-smn',
        user_id: 'current-user',
        external_id: RESULT.feed_url,
        title: RESULT.title,
        is_subscribed: true,
        subscribed_at: '2026-10-19T00:00:00Z',
        notifications_enabled: false,
        format_preference: 'both',
        type: 'podcast',
        podcast_feed_url: RESULT.feed_url,
        created_at: '2026-10-19T00:00:00Z',
        updated_at: '2026-10-19T00:00:00Z',
      } as Channel,
    ]);

    renderSection();
    const open = await waitFor(() => screen.getByRole('button', { name: /open some more news/i }));
    fireEvent.click(open);

    await waitFor(() => {
      expect(screen.getByTestId('channel-screen'), 'the route is reached').toBeTruthy();
    });
  });

  it('the subscribed control is not a dead button', async () => {
    vi.spyOn(channelCommands, 'list').mockResolvedValue([
      {
        id: 'ch-smn',
        user_id: 'current-user',
        external_id: RESULT.feed_url,
        title: RESULT.title,
        is_subscribed: true,
        subscribed_at: '2026-10-19T00:00:00Z',
        notifications_enabled: false,
        format_preference: 'both',
        type: 'podcast',
        podcast_feed_url: RESULT.feed_url,
        created_at: '2026-10-19T00:00:00Z',
        updated_at: '2026-10-19T00:00:00Z',
      } as Channel,
    ]);

    renderSection();
    const open = (await waitFor(() => screen.getByRole('button', { name: /open some more news/i }))) as HTMLButtonElement;
    expect(open.disabled, 'a subscribed show must be reachable, not greyed out').toBe(false);
    // The old dead control is gone rather than relabelled in place.
    expect(screen.queryByRole('button', { name: /subscribed to/i })).toBeNull();
  });

  it('an unsubscribed show still offers Subscribe', async () => {
    vi.spyOn(channelCommands, 'list').mockResolvedValue([]);
    const subscribe = vi.spyOn(podcastCommands, 'subscribe').mockResolvedValue({
      channel_id: 'ch-new', title: RESULT.title, new_episodes: 2,
    });

    renderSection();
    const button = (await waitFor(() => screen.getByRole('button', { name: /subscribe to some more news/i }))) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(subscribe).toHaveBeenCalledWith(RESULT.feed_url, RESULT.title));
  });
});
