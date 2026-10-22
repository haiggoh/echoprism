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
import { ChannelsScreen } from '../components/screens/ChannelsScreen';
import { HistoryScreen } from '../components/screens/HistoryScreen';
import { DownloadsScreen } from '../components/screens/DownloadsScreen';
import { resetMockState } from '../mocks/router';
import { mockDb } from '../mocks/data';

function renderScreen(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => resetMockState());
afterEach(() => cleanup());

describe('2c: previously-static screens now load real content', () => {
  it('Channels lists the mock subscriptions and unsubscribes', async () => {
    renderScreen(<ChannelsScreen />);
    await waitFor(() => {
      expect(screen.getAllByTestId('channel-row').length).toBe(mockDb.channels.length);
    });
    const before = screen.getAllByTestId('channel-row').length;
    fireEvent.click(screen.getAllByRole('button', { name: /unsubscribe from/i })[0]);
    await waitFor(() => {
      expect(screen.getAllByTestId('channel-row').length).toBe(before - 1);
    });
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
