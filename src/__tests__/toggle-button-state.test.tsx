// @vitest-environment jsdom
/**
 * Live-test batch 2, Task 1b: "what's up with the stange button left of the
 * skip backward to previous button? the leftmost button in the play bar. I
 * don't know what it could be and why it's there. it deserves the same deeper
 * investigation."
 *
 * Investigated: it is the SHUFFLE button, and on BOTH surfaces it IS wired
 * (onClick -> setShuffle). So this is not a missing handler — it is a missing
 * STATE. Neither button carries aria-pressed and neither has active styling,
 * so toggling it changes the queue's behaviour on Next while looking exactly
 * the same. The owner's reading ("they don't seem to be wired yet") is the
 * correct conclusion from what they could see.
 *
 * The codebase already has the pattern: toggles elsewhere carry aria-pressed
 * (InstanceCard, ChannelCard). These two just never got it.
 *
 * Discriminants: removing the aria-pressed fails the first test; removing the
 * active styling fails the second.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PlayerScreen } from '../components/screens/PlayerScreen';
import { PlayerProvider, usePlayer as usePlayerContext } from '../components/PlayerProvider';
import { ConvergenceProvider } from '../hooks/useConvergence';
import { useQueueStore } from '../store/slices/queueSlice';
import { usePlayerStore } from '../store/slices/playerSlice';
import { resetMockState } from '../mocks/router';

function Probe() {
  const { registerVideoElement } = usePlayerContext();
  return <video ref={registerVideoElement} />;
}

function renderPlayer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/player/ep-video-1']}>
        <PlayerProvider>
          <ConvergenceProvider>
            <Probe />
            <Routes>
              <Route path="/player/:episodeId" element={<PlayerScreen />} />
            </Routes>
          </ConvergenceProvider>
        </PlayerProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  resetMockState();
  useQueueStore.setState({ items: [], currentIndex: 0, repeatMode: 'off', shuffle: false });
  usePlayerStore.setState({ volume: 0.7, playbackState: null, isPlaying: false });
});

afterEach(cleanup);

describe('Live-test batch 2 Task 1b: toggle buttons must show their state', () => {
  it('shuffle announces its pressed state to assistive tech', async () => {
    renderPlayer();
    const shuffle = await waitFor(() => {
      const el = screen.getByRole('button', { name: 'Shuffle' });
      return el as HTMLButtonElement;
    });

    expect(shuffle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(shuffle);
    await waitFor(() => expect(useQueueStore.getState().shuffle).toBe(true));
    expect(shuffle.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(shuffle);
    await waitFor(() => expect(useQueueStore.getState().shuffle).toBe(false));
    expect(shuffle.getAttribute('aria-pressed')).toBe('false');
  });

  it('shuffle is visually distinct when on', async () => {
    renderPlayer();
    const shuffle = (await waitFor(() => screen.getByRole('button', { name: 'Shuffle' }))) as HTMLButtonElement;

    const offClass = shuffle.className;
    fireEvent.click(shuffle);
    await waitFor(() => expect(useQueueStore.getState().shuffle).toBe(true));

    // A class change is what makes the state visible without a screen reader;
    // the accent colour is the codebase's active-control marker.
    expect(shuffle.className).not.toBe(offClass);
    expect(shuffle.className).toMatch(/accent/);
  });

  it('shuffle is labelled in VISIBLE text, not only by its icon', async () => {
    // Live-test batch 2 Task 1c: "the shuffle icon needs to be replaced with one
    // that is styled to be typically recognized as this function based on what
    // uses have come to know from other apps with a player." A glyph alone —
    // especially one drawn thin at 18-24px — is not reliably recognisable, so the
    // control carries the word "Shuffle" too.
    renderPlayer();
    const shuffle = (await waitFor(() => screen.getByRole('button', { name: 'Shuffle' }))) as HTMLButtonElement;

    expect(shuffle.textContent).toContain('Shuffle');
    // And the glyph is drawn bold enough to survive a small render: the
    // arrowheads are what made it read as abstract crossing lines.
    const svg = shuffle.querySelector('svg');
    expect(svg?.getAttribute('stroke-width')).toBe('2.6');
  });

  it('repeat announces its mode too', async () => {
    renderPlayer();
    const repeat = (await waitFor(() => screen.getByRole('button', { name: /^Repeat/ }))) as HTMLButtonElement;

    expect(repeat.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(repeat); // off -> all
    await waitFor(() => expect(useQueueStore.getState().repeatMode).toBe('all'));
    expect(repeat.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(repeat); // all -> one
    await waitFor(() => expect(useQueueStore.getState().repeatMode).toBe('one'));
    expect(repeat.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(repeat); // one -> off
    await waitFor(() => expect(useQueueStore.getState().repeatMode).toBe('off'));
    expect(repeat.getAttribute('aria-pressed')).toBe('false');
  });
});
