// @vitest-environment jsdom
/**
 * Live-test Task 7: "important feature: playback speed, doesn't exist yet but
 * I want it."
 *
 * Measured before planning: `playbackRate` already lived in the player store
 * and was already applied to BOTH media elements — the plan's "applied to audio
 * only / not applied to video" premise had drifted. What was actually missing:
 *
 *  1. a CONTROL (no way to change the rate at all);
 *  2. PERSISTENCE (the choice died with the session);
 *  3. re-application on SOURCE CHANGE — the HTML media spec resets
 *     playbackRate to 1 when a new src is loaded, and the effect that applies
 *     the rate is keyed on [rate, element], never on the source, so every new
 *     episode silently played at 1x again.
 *
 * Discriminants: removing the control fails test 1; removing the src-change
 * re-application fails test 2 (the rate is manually reset to 1 first, so the
 * assertion cannot pass by luck); removing persistence fails tests 3 and 4.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PlayerProvider, usePlayer } from '../components/PlayerProvider';
import { PLAYBACK_RATE_STORAGE_KEY, PLAYBACK_RATES, SpeedControl } from '../components/player/SpeedControl';
import { resetMockState } from '../mocks/router';
import { mockDb } from '../mocks/data';
import { usePlayerStore } from '../store/slices/playerSlice';

let api: ReturnType<typeof usePlayer>;

function Probe() {
  const ctx = usePlayer();
  api = ctx;
  return <video ref={ctx.registerVideoElement} />;
}

function renderPlayer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PlayerProvider>
          <Probe />
          <SpeedControl />
        </PlayerProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The two media elements: the registered <video> and PlayerProvider's <audio>. */
function mediaElements(container: HTMLElement) {
  return {
    video: container.querySelector('video') as HTMLVideoElement,
    audio: container.querySelector('audio') as HTMLAudioElement,
  };
}

/** jsdom in this repo runs without a localStorage global (the guarded
 *  `window.localStorage?.` access in SpeedControl tolerates that); the
 *  persistence assertions need a real one, so provide the repo's minimal
 *  in-memory double — same shape as theme-truthfulness.test.tsx. */
function stubStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  });
}

beforeAll(() => {
  stubStorage();
  window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve()) as unknown as HTMLMediaElement['play'];
  window.HTMLMediaElement.prototype.pause = vi.fn() as unknown as HTMLMediaElement['pause'];
});

beforeEach(() => {
  localStorage.clear();
  resetMockState();
  // The Zustand store is module-level state shared by every test in the file.
  usePlayerStore.getState().setPlaybackRate(1);
});

afterEach(cleanup);

describe('Live-test Task 7: playback speed', () => {
  it('offers the standard rates and applies the chosen one to the media element', async () => {
    const { container } = renderPlayer();
    await waitFor(() => expect(api).toBeDefined());

    const picker = screen.getByLabelText('Playback speed') as HTMLSelectElement;
    // Every documented rate is offered.
    expect(Array.from(picker.options).map((o) => o.value)).toEqual(
      PLAYBACK_RATES.map((r) => String(r)),
    );

    fireEvent.change(picker, { target: { value: '1.5' } });

    await waitFor(() => expect(api.playbackRate).toBe(1.5));
    expect(mediaElements(container).video.playbackRate).toBe(1.5);
    expect(mediaElements(container).audio.playbackRate).toBe(1.5);
  });

  it('re-applies the rate on a source change instead of leaving it at 1x', async () => {
    const { container } = renderPlayer();
    await waitFor(() => expect(api).toBeDefined());

    fireEvent.change(screen.getByLabelText('Playback speed'), { target: { value: '1.5' } });
    await waitFor(() => expect(api.playbackRate).toBe(1.5));
    const { video, audio } = mediaElements(container);

    // Start episode one: a src is assigned and the rate travels with it.
    await act(async () => {
      api.play(mockDb.episodes[0]);
    });
    await waitFor(() => expect(video.getAttribute('src')).toBeTruthy());

    // Simulate what the browser does when a NEW src loads: playbackRate resets
    // to 1. jsdom does not model that reset, so asserting "still 1.5" here
    // would pass even with no re-application — that is why this line exists.
    video.playbackRate = 1;
    audio.playbackRate = 1;

    // A different episode ⇒ a different src ⇒ the rate must be re-applied.
    await act(async () => {
      api.play(mockDb.episodes[1]);
    });
    await waitFor(() => {
      expect(video.getAttribute('src')).not.toBe(undefined);
    });

    await waitFor(() => {
      expect(api.playbackRate).toBe(1.5);
      expect(video.playbackRate, 'a new source must not silently drop the rate').toBe(1.5);
    });
  });

  it('persists the choice and restores it on the next launch', async () => {
    renderPlayer();
    await waitFor(() => expect(api).toBeDefined());

    fireEvent.change(screen.getByLabelText('Playback speed'), { target: { value: '1.75' } });
    await waitFor(() => expect(api.playbackRate).toBe(1.75));
    expect(localStorage.getItem(PLAYBACK_RATE_STORAGE_KEY)).toBe('1.75');

    // A fresh launch: the store starts at its default and must hydrate from
    // storage rather than stay at 1.
    usePlayerStore.getState().setPlaybackRate(1);
    cleanup();

    renderPlayer();
    await waitFor(() => expect(api.playbackRate).toBe(1.75));
    expect(screen.getByLabelText('Playback speed')).toHaveProperty('value', '1.75');
  });

  it('ignores a corrupt stored value instead of setting NaN', async () => {
    localStorage.setItem(PLAYBACK_RATE_STORAGE_KEY, 'not-a-number');
    renderPlayer();
    await waitFor(() => expect(api).toBeDefined());

    expect(api.playbackRate).toBe(1);
    expect(Number.isNaN(api.playbackRate)).toBe(false);
  });

  it('ignores a stored rate outside the documented set', async () => {
    // A number the media element WOULD accept (the spec allows any positive
    // rate) but the picker does not offer. Applying it would put the engine
    // and the control out of step: the select could not show the value, and
    // its own onChange guard would refuse it. Measured: dropping the range
    // check passed the NaN test above, because isFinite already rejects a
    // non-numeric string — this case is what actually pins the range check.
    localStorage.setItem(PLAYBACK_RATE_STORAGE_KEY, '3');
    renderPlayer();
    await waitFor(() => expect(api).toBeDefined());

    expect(api.playbackRate).toBe(1);
    expect((PLAYBACK_RATES as readonly number[]).includes(api.playbackRate)).toBe(true);
  });
});
