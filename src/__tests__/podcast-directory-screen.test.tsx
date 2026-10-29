// @vitest-environment jsdom
/**
 * 2e: the iTunes podcast directory reaches the Search screen. The section
 * renders on the 'all' and 'podcast' filters (the live-smoke criterion —
 * podcast AND videos in one search — must hold on the DEFAULT tab), queries
 * the SUBMITTED term (iTunes is a rate-limited third party; no per-keystroke
 * fire), and a successful subscribe lists that feed's episodes inline on the
 * shared card-click chain.
 *
 * Discriminants: removing the filter gate fails the 'video'-tab assertion;
 * removing the episode-list fetch fails the subscribe assertions (both
 * mutation-checked in the plan).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SearchScreen } from '../components/screens/SearchScreen';
import { PlayerProvider } from '../components/PlayerProvider';
import { mockInvoke, resetMockState } from '../mocks/router';
import * as bridge from '../tauri-bridge';

function renderSearch() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PlayerProvider>
          <SearchScreen />
        </PlayerProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function submitQuery(term: string) {
  fireEvent.change(screen.getByLabelText('Search videos, podcasts, channels'), {
    target: { value: term },
  });
  fireEvent.click(screen.getByRole('button', { name: /^search$/i }));
}

beforeEach(() => resetMockState());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('2e: podcast directory on the Search screen', () => {
  it('shows directory results with a Subscribe action for the submitted term', async () => {
    renderSearch();
    submitQuery('signal');

    // The heading also renders while loading, so wait for the RESULT text.
    expect(await screen.findByText('The Weekly Signal')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /podcast directory/i })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /subscribe to the weekly signal/i }),
    ).toBeTruthy();
  });

  it('hides the directory section on the video filter (no wasted iTunes query)', async () => {
    renderSearch();
    submitQuery('signal');
    await screen.findByRole('heading', { name: /podcast directory/i });

    fireEvent.click(screen.getByRole('tab', { name: /video/i }));
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /podcast directory/i })).toBeNull();
    });
  });

  it('a successful subscribe lists the feed episodes inline', async () => {
    renderSearch();
    submitQuery('signal');

    const button = await screen.findByRole('button', { name: /subscribe to the weekly signal/i });
    fireEvent.click(button);

    // REVISED 2026-10-29 (live-test batch 2, Task 6): this asserted the OLD
    // dead control (`/subscribed/i` = a disabled "Subscribed ✓" button). A
    // subscribed show now opens its channel (/channels/:id) instead, because a
    // disabled button gave the owner no way in — see
    // src/__tests__/podcast-directory-card.test.tsx. The inline episode list
    // below is unchanged and still the point of this test.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /open the weekly signal/i })).toBeTruthy();
    });
    // The subscribed feed's episodes, from get_feed { channelId }.
    await waitFor(() => {
      expect(screen.getByText(/Episode 118: The instance reliability problem, revisited/)).toBeTruthy();
    });
    expect(screen.getByText(/Episode 117: Why RSS outlived every aggregator/)).toBeTruthy();
  });

  it('a term with no directory hits renders no directory section', async () => {
    renderSearch();
    submitQuery('zzz-no-directory-hit');

    // Local search completes; the section must never appear.
    await waitFor(() => {
      expect(screen.getByText(/enter a search query|no results|search failed/i)).toBeTruthy();
    });
    expect(screen.queryByRole('heading', { name: /podcast directory/i })).toBeNull();
  });

  it('Phase B: the Retry button refetches the failed search', async () => {
    // 2f made store failures surface as the command's Err; the Search
    // screen's error state then offered a Retry button wired to NOTHING
    // (the 2c relic `onClick={() => {}}`). Retry must invalidate the
    // failed query so a transient store error is recoverable in-place.
    let searchCalls = 0;
    vi.spyOn(bridge, 'invoke').mockImplementation((cmd, args) => {
      if (cmd === 'search_episodes') {
        searchCalls += 1;
        if (searchCalls === 1) return Promise.reject(new Error('store failed'));
      }
      return mockInvoke(cmd as string, args as Record<string, unknown> | undefined);
    });

    renderSearch();
    submitQuery('signal');
    await screen.findByText('Search failed');

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(searchCalls).toBe(2);
    }, { timeout: 3000 });
    // Recovery proven by the error state clearing (derived from the
    // fixtures: no local episode title contains 'signal', so the refetched
    // search renders its empty state, not a results grid).
    await waitFor(() => {
      expect(screen.queryByText('Search failed')).toBeNull();
    });
  });
});
