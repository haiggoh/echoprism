// @vitest-environment jsdom
/**
 * Live-test batch 2, Task 7: "in search, the all tab tends to keep showing me
 * the same results as before up first even though I changed what I'm searching
 * for."
 *
 * Measured cause: the local FTS query was gated on `showResults`, which is set
 * by SUBMIT — while the code's own comment two lines above claims "The local
 * FTS search below keeps its per-keystroke behavior". So typing a new term kept
 * rendering the previous term's rows until Enter was pressed: documented intent
 * and actual behaviour had drifted apart.
 *
 * iTunes stays submit-gated (it is a rate-limited third party); only the local
 * search becomes live.
 *
 * Discriminants: re-adding the submit gate fails the first test; removing the
 * per-keystroke key fails the second.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SearchScreen } from '../components/screens/SearchScreen';
import { PlayerProvider } from '../components/PlayerProvider';
import { ConvergenceProvider } from '../hooks/useConvergence';
import { episodeCommands, podcastCommands } from '../hooks/useTauriCommands';
import { resetMockState } from '../mocks/router';

function renderSearch() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PlayerProvider>
          <ConvergenceProvider>
            <SearchScreen />
          </ConvergenceProvider>
        </PlayerProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  resetMockState();
});

afterEach(cleanup);

describe('Live-test batch 2 Task 7: local search is live', () => {
  it('typing a new term replaces the results without submitting', async () => {
    const search = vi.spyOn(episodeCommands, 'search').mockImplementation((q: string) =>
      Promise.resolve(
        q.trim().length === 0
          ? []
          : [
              {
                id: `ep-${q.trim()}`,
                channel_id: 'ch-1',
                external_id: `ep-${q.trim()}`,
                title: `Result for ${q.trim()}`,
                is_downloaded: false,
                progress_seconds: 0,
                created_at: '2026-10-19T00:00:00Z',
                updated_at: '2026-10-19T00:00:00Z',
              } as never,
            ],
      ),
    );

    renderSearch();
    const input = screen.getByPlaceholderText(/search/i) as HTMLInputElement;

    // Type WITHOUT pressing Enter — the submit-gated behaviour the owner hit.
    fireEvent.change(input, { target: { value: 'vergecast' } });
    await waitFor(() => expect(screen.getByText('Result for vergecast')).toBeTruthy());

    fireEvent.change(input, { target: { value: 'even more news' } });

    // The previous term's rows are GONE, not sitting "up first".
    await waitFor(() => {
      expect(screen.queryByText('Result for vergecast')).toBeNull();
      expect(screen.getByText('Result for even more news')).toBeTruthy();
    });
    search.mockRestore();
  });

  it('the iTunes directory is still queried on SUBMIT only', async () => {
    // The rate-limit rationale in the source comment must survive this change:
    // making the LOCAL search live must not turn every keystroke into an
    // iTunes request.
    const search = vi.spyOn(episodeCommands, 'search').mockResolvedValue([]);
    const dirSearch = vi.spyOn(podcastCommands, 'search').mockResolvedValue([]);

    renderSearch();
    const input = screen.getByPlaceholderText(/search/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'some more news' } });
    await waitFor(() => expect(search).toHaveBeenCalledWith('some more news', expect.anything()));

    // Typing alone must not reach the rate-limited third party.
    expect(dirSearch).not.toHaveBeenCalled();

    fireEvent.submit(input.closest('form') as HTMLFormElement);
    await waitFor(() => expect(dirSearch).toHaveBeenCalledWith('some more news'));
    search.mockRestore();
    dirSearch.mockRestore();
  });
});
