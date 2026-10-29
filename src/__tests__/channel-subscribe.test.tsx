// @vitest-environment jsdom
/**
 * Live-test batch 2, Task 8: "subscriptions seem to be missing, there's no
 * obvious way to subscribe to a channel. I should be able to click on the
 * channel name when watching one of their videos."
 *
 * Measured cause: ChannelScreen had no subscribe affordance at all, and
 * PlayerScreen rendered the channel title as plain text (line ~169) — not a
 * link. Batch 1 made channels navigable, and the `subscribe` command already
 * existed, so nothing was missing except the wiring.
 *
 * A trap avoided: `channelCommands.subscribe` INSERTS a new channel row, so
 * using it for a channel that already exists would duplicate the channel and
 * detach its episodes. Re-subscribing an existing channel goes through the new
 * `resubscribe` UPDATE instead.
 *
 * Discriminants: removing the player's channel link fails the first test;
 * removing the screen's controls fails the others.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ChannelsScreen } from '../components/screens/ChannelsScreen';
import { ChannelScreen } from '../components/screens/ChannelScreen';
import { PlayerScreen } from '../components/screens/PlayerScreen';
import { PlayerProvider, usePlayer } from '../components/PlayerProvider';
import { ConvergenceProvider } from '../hooks/useConvergence';
import { channelCommands } from '../hooks/useTauriCommands';
import { resetMockState } from '../mocks/router';

function Probe() {
  const { registerVideoElement } = usePlayer();
  return <video ref={registerVideoElement} />;
}

function wrap(ui: React.ReactElement, initial: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initial]}>
        <PlayerProvider>
          <ConvergenceProvider>
            <Probe />
            <Routes>{ui}</Routes>
          </ConvergenceProvider>
        </PlayerProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function ChannelMarker() {
  return <div data-testid="channel-screen">the channel</div>;
}

const APP_ROUTES = (
  <>
    <Route path="/channels" element={<ChannelsScreen />} />
    <Route path="/channels/:channelId" element={<ChannelScreen />} />
    <Route path="/player/:episodeId" element={<PlayerScreen />} />
    <Route path="/channels/:channelId" element={<ChannelMarker />} />
  </>
);

beforeEach(() => {
  resetMockState();
});

afterEach(cleanup);

describe('Live-test batch 2 Task 8: subscribing is reachable', () => {
  it('the channel name while watching a video is a link into the channel', async () => {
    wrap(APP_ROUTES, '/player/ep-video-1');
    // PlayerScreen loads the episode from the route param via the mock router.
    const link = await waitFor(() => screen.getByRole('button', { name: /tech talks weekly/i }));
    fireEvent.click(link);

    await waitFor(() => {
      expect(screen.getByTestId('channel-screen'), 'the channel screen is reached').toBeTruthy();
    });
  });

  it('a subscribed channel offers Unsubscribe', async () => {
    wrap(APP_ROUTES, '/channels/ch-1');
    const unsub = await waitFor(() => screen.getByRole('button', { name: /unsubscribe from tech talks weekly/i }));
    expect((unsub as HTMLButtonElement).disabled).toBe(false);
  });

  it('an unsubscribed channel offers Subscribe, and it calls resubscribe', async () => {
    const spy = vi.spyOn(channelCommands, 'resubscribe').mockResolvedValue(undefined);
    wrap(APP_ROUTES, '/channels/ch-5');

    const sub = await waitFor(() => screen.getByRole('button', { name: /^subscribe/i }));
    fireEvent.click(sub);

    await waitFor(() => expect(spy).toHaveBeenCalledWith('ch-5'));
    spy.mockRestore();
  });
});
