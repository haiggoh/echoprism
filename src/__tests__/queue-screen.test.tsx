// @vitest-environment jsdom
/**
 * F05 (replica/test-plan.md) — QueueScreen behaviors:
 *   - H1 step 5: Clear queue asks for confirmation FIRST; the dialog names
 *     the item count; Cancel keeps the queue; Confirm clears it.
 *
 * Pure Zustand screen — no bridge, no commands: the store is seeded
 * directly, which is also what makes the assertions exact.
 *
 * Discriminants: wiring Clear straight to clearQueue fails all three tests;
 * a dialog without the count-bearing confirm button fails the copy test.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueueScreen } from '../components/screens/QueueScreen';
import { useQueueStore } from '../store/slices/queueSlice';
import type { Episode, QueueItem } from '../types';

let epCounter = 0;
function seedQueue(count: number): QueueItem[] {
  const items: QueueItem[] = [];
  for (let i = 0; i < count; i += 1) {
    epCounter += 1;
    const episode = {
      id: `ep-${epCounter}`,
      channel_id: 'ch-1',
      external_id: `ext-${epCounter}`,
      title: `Episode ${epCounter}`,
      video_id: 'yt-video-1',
      is_downloaded: false,
      progress_seconds: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } satisfies Episode;
    items.push({
      id: `q-${epCounter}`,
      queue_id: 'local',
      episode_id: episode.id,
      added_at: new Date().toISOString(),
      source: 'feed',
      play_mode: 'unified',
      episode,
      position: i,
    });
  }
  return items;
}

function renderQueue() {
  return render(
    <MemoryRouter>
      <QueueScreen />
    </MemoryRouter>
  );
}

beforeEach(() => {
  useQueueStore.setState({
    items: [],
    currentIndex: 0,
    repeatMode: 'off',
    shuffle: false,
    audioOnlyMode: false,
    isLoading: false,
    error: null,
  });
});

afterEach(() => {
  cleanup();
});

describe('QueueScreen clear-queue confirmation (F05-H1 step 5)', () => {
  it('asks for confirmation before clearing, naming the item count', async () => {
    useQueueStore.setState({ items: seedQueue(2) });
    renderQueue();

    fireEvent.click(screen.getByRole('button', { name: 'Clear queue' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Clear queue?')).toBeTruthy();
    // The destructive button restates the count — no surprise bulk deletes.
    expect(within(dialog).getByRole('button', { name: 'Clear 2 episodes' })).toBeTruthy();
    // Nothing is cleared while the dialog is open.
    expect(useQueueStore.getState().items).toHaveLength(2);
  });

  it('Cancel keeps the queue and closes the dialog', async () => {
    useQueueStore.setState({ items: seedQueue(2) });
    renderQueue();

    fireEvent.click(screen.getByRole('button', { name: 'Clear queue' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useQueueStore.getState().items).toHaveLength(2);
  });

  it('Confirm clears the queue and closes the dialog', async () => {
    useQueueStore.setState({ items: seedQueue(3) });
    renderQueue();

    fireEvent.click(screen.getByRole('button', { name: 'Clear queue' }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear 3 episodes' }));
    });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useQueueStore.getState().items).toHaveLength(0);
    expect(useQueueStore.getState().currentIndex).toBe(0);
  });
});
