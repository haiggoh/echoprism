// @vitest-environment jsdom
/**
 * Live-test honesty pass (owner, 2026-10-23) — the design contract for the
 * header and the mini player:
 *   - the header search is REAL: typing + Enter navigates to /search with
 *     the query (it was a dead input);
 *   - the placeholder bell (hardcoded "3") and the account-style avatar are
 *     GONE (nothing real is behind either; episode notifications become a
 *     feature when a seen-state exists);
 *   - the wide center badge is GONE (three brand iterations was too much);
 *   - the MiniPlayer renders ONE control bar — no hover-expanded duplicate
 *     panel (the "two queue bars" of the live test), its expand control goes
 *     to the full player screen, and its seek strip is keyboard-operable.
 *
 * Discriminants: re-adding the second Shuffle (the expanded panel) fails
 * the single-transport assertion; unwiring the search fails the navigation
 * assertion.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { Header } from '../components/Header';
import { MiniPlayer } from '../components/MiniPlayer';
import { PlayerProvider } from '../components/PlayerProvider';
import { ConvergenceProvider } from '../hooks/useConvergence';
import { useQueueStore } from '../store/slices/queueSlice';
import { resetMockState } from '../mocks/router';
import type { Episode } from '../types';

const playingEpisode: Episode = {
  id: 'ep-pod-1',
  channel_id: 'ch-2',
  external_id: 'deep-dive-042',
  title: 'RSS is winning again',
  podcast_guid: 'deep-dive-042',
  audio_url: '/mock-media/ep-pod-1.wav',
  duration_seconds: 3180,
  progress_seconds: 0,
  is_downloaded: false,
  published_at: '2026-10-14T00:00:00Z',
  created_at: '2026-10-18T00:00:00Z',
  updated_at: '2026-10-18T00:00:00Z',
  channel: { id: 'ch-2', title: 'The Deep Dive Podcast' },
};

/** Renders the current location so assertions can read it — self-contained,
 *  no reliance on router internals. */
function LocationProbe() {
  const loc = useLocation();
  return (
    <div data-testid="loc" data-path={loc.pathname} data-search={loc.search} />
  );
}

function renderApp(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/feed']}>
        <ConvergenceProvider>
          <PlayerProvider>
            {ui}
            <LocationProbe />
          </PlayerProvider>
        </ConvergenceProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function currentLocation(): { path: string; search: string } {
  const el = screen.getByTestId('loc');
  return {
    path: el.getAttribute('data-path') ?? '',
    search: el.getAttribute('data-search') ?? '',
  };
}

beforeEach(() => {
  resetMockState();
  useQueueStore.setState({
    items: [
      {
        id: 'qi-1',
        queue_id: 'local',
        episode_id: playingEpisode.id,
        position: 0,
        added_at: '2026-10-18T00:00:00Z',
        source: 'feed',
        play_mode: 'unified',
        episode: playingEpisode,
      },
    ],
    currentIndex: 0,
  });
});
afterEach(() => cleanup());

describe('header honesty (live-test pass)', () => {
  it('the search input navigates to /search with the typed query on Enter', () => {
    renderApp(<Header />);
    const input = screen.getByLabelText('Quick search');
    fireEvent.change(input, { target: { value: 'vergecast' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const loc = currentLocation();
    expect(loc.path).toBe('/search');
    expect(loc.search).toContain('q=vergecast');
  });

  it('the placeholder bell and the account-style avatar are gone', () => {
    renderApp(<Header />);
    expect(screen.queryByRole('button', { name: /notifications/i })).toBeNull();
    expect(screen.queryByText('3')).toBeNull();
    expect(screen.queryByLabelText(/user|account|avatar/i)).toBeNull();
  });

  it('the wide center brand badge is gone (two brand marks were enough)', () => {
    renderApp(<Header />);
    // The header badge was PrismBadge width={64} — an inline-styled
    // 64px-wide box. Nothing in the header may carry that wide mark.
    expect(document.querySelector('header div[style*="width: 64px"]')).toBeNull();
  });
});

describe('MiniPlayer is ONE control bar (live-test pass)', () => {
  it('renders a single set of transport controls — no hover-expanded duplicate', async () => {
    renderApp(<MiniPlayer />);
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Shuffle' })).toHaveLength(1);
    });
    expect(screen.getAllByRole('button', { name: 'Previous' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Next' })).toHaveLength(1);
    // One play/pause — and playing must not read as danger.
    const playButtons = screen.getAllByRole('button', { name: /^pause$|^play$/i });
    expect(playButtons).toHaveLength(1);
    expect(playButtons[0].className).not.toContain('bg-danger');
  });

  it('the expand control navigates to the full player instead of growing a second bar', () => {
    renderApp(<MiniPlayer />);
    fireEvent.click(screen.getByRole('button', { name: /open full player/i }));
    expect(currentLocation().path).toMatch(/^\/player\//);
  });

  it('an integrated seek strip is always visible and keyboard-operable', () => {
    renderApp(<MiniPlayer />);
    const seek = screen.getByRole('slider', { name: /seek/i });
    expect(seek.getAttribute('tabindex')).toBe('0');
  });
});
