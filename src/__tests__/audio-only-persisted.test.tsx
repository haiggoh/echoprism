// @vitest-environment jsdom
/**
 * Parity audit batch 3, Task 3 — owner decision 2026-11-02: Audio only is
 * REMEMBERED across launches. The column already existed
 * (user_preferences.audio_only_default) but nothing read or wrote it, and the
 * Settings "Default format" radio beside it was equally dead (never read).
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PlayerProvider } from '../components/PlayerProvider';
import { AudioOnlyToggle } from '../components/player/AudioOnlyToggle';
import { settingsCommands } from '../hooks/useTauriCommands';
import { usePlayerStore } from '../store/slices/playerSlice';
import { resetMockState } from '../mocks/router';
import type { UserPreferences } from '../types';

function renderToggle() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PlayerProvider>
          <AudioOnlyToggle />
        </PlayerProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve()) as unknown as HTMLMediaElement['play'];
  window.HTMLMediaElement.prototype.pause = vi.fn() as unknown as HTMLMediaElement['pause'];
});
beforeEach(() => {
  resetMockState();
  usePlayerStore.setState({ isPlaying: false, playbackState: null, isAudioMode: false });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Audio only is remembered (owner decision 2026-11-02)', () => {
  it('starts in audio mode when the stored preference says so', async () => {
    const prefs = await settingsCommands.get();
    vi.spyOn(settingsCommands, 'get').mockResolvedValue({ ...prefs, audio_only_default: true });
    renderToggle();
    await waitFor(() => expect((screen.getByLabelText('Audio only mode') as HTMLInputElement).checked).toBe(true));
  });

  it('a toggle writes the preference', async () => {
    const update = vi.spyOn(settingsCommands, 'update');
    renderToggle();
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Audio only mode'));
    });
    expect(update).toHaveBeenCalledWith({ audio_only_default: true });
  });

  it('a toggle made BEFORE the stored value arrives is not overwritten by it (Review Focus 2)', async () => {
    const prefs = await settingsCommands.get();
    let release!: (p: UserPreferences) => void;
    vi.spyOn(settingsCommands, 'get').mockReturnValue(new Promise((r) => { release = r; }));
    renderToggle();
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Audio only mode')); // user: ON
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Audio only mode')); // user: OFF again
    });
    await act(async () => {
      release({ ...prefs, audio_only_default: true }); // a stale stored ON lands late
    });
    expect((screen.getByLabelText('Audio only mode') as HTMLInputElement).checked).toBe(false);
  });
});
