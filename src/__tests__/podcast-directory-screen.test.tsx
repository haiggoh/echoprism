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
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SearchScreen } from '../components/screens/SearchScreen';
import { PlayerProvider } from '../components/PlayerProvider';
import { resetMockState } from '../mocks/router';

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
afterEach(() => cleanup());

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

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /subscribed/i })).toBeTruthy();
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
});
