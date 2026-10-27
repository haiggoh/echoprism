// @vitest-environment jsdom
/**
 * Live-test 2026-10-27: "history still doesn't seem to work". Recording did
 * work (a row landed in the real DB); the SCREEN did not show it. The app's
 * QueryClient keeps results fresh for 5 minutes (main.tsx staleTime) and
 * recording a play never told the cache ['history'] had changed, so a
 * History screen loaded before the play kept showing the old list.
 *
 * This test uses the app's own staleTime and the real mock router (no
 * command mocks): a play must appear in an already-loaded History list.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PlayerProvider, usePlayer } from '../components/PlayerProvider';
import { HistoryScreen } from '../components/screens/HistoryScreen';
import { historyCommands } from '../hooks/useTauriCommands';
import { resetMockState } from '../mocks/router';
import { mockDb } from '../mocks/data';

let api: ReturnType<typeof usePlayer>;

function Probe() {
  const ctx = usePlayer();
  api = ctx;
  return <video ref={ctx.registerVideoElement} />;
}

beforeAll(() => {
  window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve()) as unknown as HTMLMediaElement['play'];
  window.HTMLMediaElement.prototype.pause = vi.fn() as unknown as HTMLMediaElement['pause'];
});

beforeEach(async () => {
  resetMockState();
  await historyCommands.clear();
});

afterEach(cleanup);

describe('History screen reflects new plays', () => {
  it('a play shows up in an already-loaded History list (5-minute staleTime)', async () => {
    // Same cache policy as src/main.tsx.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 1000 * 60 * 5 } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <PlayerProvider>
            <Probe />
            <HistoryScreen />
          </PlayerProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Loaded, and empty.
    await waitFor(() => expect(screen.queryByText(/loading history/i)).toBeNull());
    expect(screen.queryAllByTestId('history-row')).toHaveLength(0);

    const episode = mockDb.episodes[0];
    await act(async () => {
      api.play(episode);
    });

    await waitFor(() => {
      expect(screen.getAllByTestId('history-row')).toHaveLength(1);
    });
    expect(screen.getByText(episode.title)).toBeTruthy();
  });
});
