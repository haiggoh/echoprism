// @vitest-environment jsdom
/**
 * 2c: Channels, History and Downloads were static stubs — headings with a
 * permanent empty state and no query at all — while their commands, their
 * Rust backends and (for two of them) their mock handlers were all live.
 * Each screen now loads its data and handles loading/error/empty.
 *
 * Discriminants: dropping any query returns the stub behaviour and the
 * seeded rows vanish; the filter test fails if the Downloads select is not
 * actually wired to the command's status parameter.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ChannelsScreen } from '../components/screens/ChannelsScreen';
import { HistoryScreen } from '../components/screens/HistoryScreen';
import { DownloadsScreen } from '../components/screens/DownloadsScreen';
import { resetMockState } from '../mocks/router';
import { mockDb } from '../mocks/data';

function renderScreen(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // MemoryRouter: history rows link back to the player (live-test pass 2).
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => resetMockState());
afterEach(() => cleanup());

describe('2c: previously-static screens now load real content', () => {
  // Live-test Task 4 (2026-10-27): the Channels list is SUBSCRIPTIONS only.
  // The fixture deliberately carries one search-saved channel (ch-5,
  // is_subscribed: false) that must never appear, so the expected row count is
  // derived from the fixture's subscribed rows — not the whole table, which is
  // what these two tests asserted before the owner reported the bug.
  const subscribedCount = mockDb.channels.filter((c) => c.is_subscribed).length;

  it('Channels lists the mock subscriptions and unsubscribes', async () => {
    renderScreen(<ChannelsScreen />);
    await waitFor(() => {
      expect(screen.getAllByTestId('channel-row').length).toBe(subscribedCount);
    });
    expect(mockDb.channels.length).toBeGreaterThan(subscribedCount);
    expect(screen.queryByText('Archive Bonus Content')).toBeNull();

    const before = screen.getAllByTestId('channel-row').length;
    fireEvent.click(screen.getAllByRole('button', { name: /unsubscribe from/i })[0]);
    await waitFor(() => {
      expect(screen.getAllByTestId('channel-row').length).toBe(before - 1);
    });
  });

  it('live-test pass: channel rows carry an avatar and a home link where one exists', async () => {
    renderScreen(<ChannelsScreen />);
    await waitFor(() => {
      expect(screen.getAllByTestId('channel-row').length).toBe(subscribedCount);
    });

    // Every row renders the avatar surface (real image or the shared
    // Thumbnail fallback) — "profile picture matching each channel".
    expect(document.querySelectorAll('[data-testid="channel-row"] img, [data-testid="channel-row"] [data-testid="thumbnail-fallback"]').length)
      .toBe(subscribedCount);

    // Home links derive per type (mirrors home_url_for): video channels
    // link to their YouTube id; the fixture podcast feeds carry no site
    // link, so those rows honestly have none.
    const videoRow = screen.getByRole('link', { name: /open tech talks weekly home/i });
    expect(videoRow.getAttribute('href')).toBe('https://www.youtube.com/channel/UC-mock-tech-talks');
    expect(screen.queryByRole('link', { name: /open the deep dive podcast home/i })).toBeNull();
  });

  it('History lists playback history and clears it', async () => {
    renderScreen(<HistoryScreen />);
    await waitFor(() => {
      expect(screen.getAllByTestId('history-row').length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getByRole('button', { name: /clear history/i }));
    await waitFor(() => {
      expect(screen.queryAllByTestId('history-row').length).toBe(0);
    });
  });

  it('Downloads lists all three seeded row shapes (completed, in-flight, failed)', async () => {
    renderScreen(<DownloadsScreen />);
    await waitFor(() => {
      expect(screen.getAllByTestId('download-row').length).toBe(3);
    });
    // The failed row surfaces its error message rather than hiding it.
    expect(screen.getByText(/instance went away mid-download/i)).toBeTruthy();
    // The in-flight row offers Cancel; completed rows do not.
    expect(screen.getAllByRole('button', { name: /cancel download/i }).length).toBe(1);
  });

  it('the Downloads filter selects by STATUS (the parameter the command takes)', async () => {
    renderScreen(<DownloadsScreen />);
    await waitFor(() => expect(screen.getAllByTestId('download-row').length).toBe(3));

    fireEvent.change(screen.getByLabelText('Filter downloads'), { target: { value: 'failed' } });
    await waitFor(() => {
      expect(screen.getAllByTestId('download-row').length).toBe(1);
    });
    expect(screen.getByText(/ep-video-3/)).toBeTruthy();
  });
});
