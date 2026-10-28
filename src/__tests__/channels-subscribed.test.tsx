// @vitest-environment jsdom
/**
 * Live-test 2026-10-27: "channels shows me a lot of channels I never
 * subscribed to with the option to unsubscribe".
 *
 * Two measured causes: the backend listed every row in `channels` (103 of the
 * owner's rows were search-saved with is_subscribed=0), and `unsubscribe` was
 * a no-op stub in Rust while the mock router DELETED the row — neither matched
 * the owner's decision that an unsubscribed channel is HIDDEN, never deleted.
 *
 * These tests drive the real mock router (no command mocks): the screen must
 * hide the unsubscribed fixture, and clicking Unsubscribe must hide the row
 * without destroying it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ChannelsScreen } from '../components/screens/ChannelsScreen';
import { channelCommands } from '../hooks/useTauriCommands';
import { resetMockState } from '../mocks/router';

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Task 10 made the row navigable, so a Router is now required — the screen
  // legitimately calls useNavigate().
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ChannelsScreen />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  resetMockState();
});

afterEach(cleanup);

describe('Channels screen — subscriptions only (live-test Task 4)', () => {
  it('hides a channel the owner never subscribed to', async () => {
    renderScreen();

    // The four subscribed fixtures are listed.
    expect(await screen.findByText('Tech Talks Weekly')).toBeTruthy();
    expect(screen.getByText('The Deep Dive Podcast')).toBeTruthy();

    // ch-5 is saved by search with is_subscribed: false — it must NOT appear.
    await waitFor(() => {
      expect(screen.queryByText('Archive Bonus Content')).toBeNull();
    });

    // The header count reflects the filtered list, not the raw table.
    expect(screen.getByText('4 channels')).toBeTruthy();
  });

  it('Unsubscribe hides the row without deleting the channel', async () => {
    renderScreen();
    expect(await screen.findByText('Tech Talks Weekly')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe from Tech Talks Weekly' }));

    // Hidden from the subscriptions list...
    await waitFor(() => {
      expect(screen.queryByText('Tech Talks Weekly')).toBeNull();
    });

    // ...but the row SURVIVES (owner decision: hidden, never deleted). Asking
    // for every channel is how a future retention sweep will see what is
    // prunable — so it must still be there, flagged off.
    const every = await channelCommands.list({ subscribedOnly: false });
    const hidden = every.find((c) => c.id === 'ch-1');
    expect(hidden, 'the unsubscribed channel row is kept, not deleted').toBeDefined();
    expect(hidden?.is_subscribed).toBe(false);
  });
});
