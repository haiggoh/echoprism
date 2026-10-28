// @vitest-environment jsdom
/**
 * Live-test Task 10: "and the should have small profile pictures".
 *
 * The podcast half comes from the feed's <itunes:image> (Task 9 + the refresh
 * backfill). Video channels have no feed, so the screen asks the backend to
 * resolve an avatar from Invidious — and two things must hold:
 *
 *  1. rows that ALREADY have art are never asked (the backend would return what
 *     it has without touching the network, but the screen should not even ask);
 *  2. the fan-out is BOUNDED. A list is often dozens of rows, and one Invidious
 *     request per row at once is a self-inflicted rate-limit.
 *
 * The list is stubbed rather than taken from the shared fixture: mockDb's
 * channels carry NO thumbnail_url at all, so a fixture-derived count cannot
 * distinguish "asked for the rows that lack art" from "asked for everything" —
 * the first version of this test did exactly that and passed for the wrong
 * reason.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ChannelsScreen } from '../components/screens/ChannelsScreen';
import { channelCommands } from '../hooks/useTauriCommands';
import { resetMockState } from '../mocks/router';
import type { Channel } from '../types';

/** A controlled mix: three channels with art, six without. */
function listFixture(): Channel[] {
  return Array.from({ length: 9 }, (_, i) => ({
    id: `ch-${i}`,
    user_id: 'current-user',
    external_id: `ext-${i}`,
    title: `Channel ${i}`,
    is_subscribed: true,
    subscribed_at: '2026-10-19T00:00:00Z',
    notifications_enabled: false,
    format_preference: 'both',
    type: i % 3 === 0 ? ('podcast' as const) : ('video' as const),
    created_at: '2026-10-19T00:00:00Z',
    updated_at: '2026-10-19T00:00:00Z',
    // First three carry art already; the other six do not.
    ...(i < 3 ? { thumbnail_url: `https://img.example/art-${i}.jpg` } : {}),
  })) as Channel[];
}

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ChannelsScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  resetMockState();
});

afterEach(cleanup);

describe('Live-test Task 10: channel avatars', () => {
  it('asks for art only on the rows that lack it', async () => {
    vi.spyOn(channelCommands, 'list').mockResolvedValue(listFixture());
    const spy = vi.spyOn(channelCommands, 'resolveAvatar').mockResolvedValue(null);

    renderScreen();
    await waitFor(() => expect(screen.getByText('Channel 0')).toBeTruthy());

    // Exactly the six that lack art — and never the three that already have it.
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(6));
    expect(spy.mock.calls.map((c) => c[0]).sort()).toEqual(
      ['ch-3', 'ch-4', 'ch-5', 'ch-6', 'ch-7', 'ch-8'],
    );
    spy.mockRestore();
  });

  it('bounds the fan-out — at most four resolutions in flight', async () => {
    vi.spyOn(channelCommands, 'list').mockResolvedValue(listFixture());

    // Deferred promises, so in-flight calls can be counted before they settle.
    const gates: { id: string; resolve: (v: string | null) => void }[] = [];
    vi.spyOn(channelCommands, 'resolveAvatar').mockImplementation(
      (id: string) =>
        new Promise<string | null>((resolve) => {
          gates.push({ id, resolve });
        }),
    );

    renderScreen();
    await waitFor(() => expect(screen.getByText('Channel 0')).toBeTruthy());

    // The first batch is allowed to start.
    await waitFor(() => expect(gates.length).toBeGreaterThan(0));
    expect(
      gates.length,
      `a long list must not fire one Invidious request per row: ${gates.length} in flight`,
    ).toBeLessThanOrEqual(4);

    // Settle them and confirm the next batch is likewise bounded.
    for (const g of gates.splice(0, gates.length)) g.resolve(null);
    await act(async () => {});
    await waitFor(() => expect(gates.length).toBeGreaterThan(0));
    expect(gates.length).toBeLessThanOrEqual(4);

    // Drain the rest so no promise is left pending at teardown.
    for (const g of gates.splice(0, gates.length)) g.resolve(null);
    await act(async () => {});
    expect(gates).toHaveLength(0);
    spyCleanup(channelCommands);
  });
});

/** vi.spyOn accumulates in the registry; this keeps the drain loop from touching a stale spy. */
function spyCleanup(cmds: typeof channelCommands) {
  vi.restoreAllMocks();
  void cmds;
}
