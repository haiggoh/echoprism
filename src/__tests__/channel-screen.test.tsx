// @vitest-environment jsdom
/**
 * Live-test Task 10: "also I'd like the channels liste there to be clickable to
 * I can explore them and the should have small profile pictures".
 *
 * The Channels list rendered each channel as an inert <li>: no click target, no
 * navigation, and no way to see what a channel actually contains. There is no
 * /channels/:id route at all.
 *
 * Discriminants: reverting the row to a non-navigating element fails the first
 * test; rendering the wrong channel's episodes (ignoring the route param)
 * fails the second and third.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ChannelsScreen } from '../components/screens/ChannelsScreen';
import { ChannelScreen } from '../components/screens/ChannelScreen';
import { resetMockState } from '../mocks/router';

function renderApp(initial: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/channels" element={<ChannelsScreen />} />
          <Route path="/channels/:channelId" element={<ChannelScreen />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  resetMockState();
});

afterEach(cleanup);

describe('Live-test Task 10: channels are clickable', () => {
  it('clicking a channel row opens that channel', async () => {
    renderApp('/channels');
    await waitFor(() => expect(screen.getByText('Tech Talks Weekly')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /explore tech talks weekly/i }));

    // The channel screen is reached by ROUTE, so it is a real, linkable,
    // back-navigable destination rather than an in-place expansion.
    await waitFor(() => {
      expect(screen.getByTestId('channel-screen'), 'the /channels/:id route renders').toBeTruthy();
    });
  });

  it("the channel screen lists THAT channel's episodes only", async () => {
    renderApp('/channels/ch-1');
    await waitFor(() => expect(screen.getByTestId('channel-screen')).toBeTruthy());

    // ch-1 owns the two video episodes in the fixture.
    await waitFor(() => {
      expect(screen.getByText(/How Invidious pools actually work/)).toBeTruthy();
      expect(screen.getByText(/Big Buck Bunny/)).toBeTruthy();
    });

    // ...and nothing from ch-2/ch-3/ch-4, which is the whole point of the page.
    expect(screen.queryByText(/RSS is winning again/)).toBeNull();
    expect(screen.queryByText(/Why Billionaires Should Not Exist/)).toBeNull();
  });

  it('a different channel id shows a different channel episodes', async () => {
    renderApp('/channels/ch-2');
    await waitFor(() => expect(screen.getByTestId('channel-screen')).toBeTruthy());

    await waitFor(() => {
      expect(screen.getByText(/RSS is winning again/)).toBeTruthy();
    });
    expect(screen.queryByText(/How Invidious pools actually work/)).toBeNull();
  });
});
