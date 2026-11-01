// @vitest-environment jsdom
/**
 * Retention policy UI (waypoint echoprism-hidden-row-retention, owner decision
 * 2026-10-31: cap hidden channels at 2000, oldest pruned when exceeded).
 * The Settings > Preferences "Storage" card shows the hidden count vs the cap
 * and offers an on-demand prune. The cap/oldest/protected logic itself is
 * cargo-tested in queries.rs; here the contract is the wiring: stats render,
 * the button calls the command, the toast reports the dropped count.
 *
 * Discriminants: dropping the stats query fails the first test; a no-op
 * button fails the second.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SettingsScreen } from '../components/screens/SettingsScreen';
import { Toaster } from '../components/ui/Toaster';
import { ThemeProvider } from '../hooks/useTheme';
import { mockInvoke, resetMockState } from '../mocks/router';

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <SettingsScreen />
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => resetMockState());
afterEach(cleanup);

describe('Settings → Preferences → Storage (retention)', () => {
  it('shows the hidden-channel count against the cap', async () => {
    renderSettings();
    fireEvent.click(screen.getByRole('tab', { name: 'Preferences' }));

    // The fixture has exactly one unsubscribed channel (ch-5).
    await waitFor(() => {
      expect(screen.getByText(/Hidden channels: 1 \/ 2000/)).toBeTruthy();
    });
  });

  it('Prune now runs the sweep and reports when nothing was over the cap', async () => {
    renderSettings();
    fireEvent.click(screen.getByRole('tab', { name: 'Preferences' }));
    await waitFor(() => expect(screen.getByText(/Hidden channels:/)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Prune now' }));
    await waitFor(() => {
      expect(screen.getByText('Nothing to prune — under the cap')).toBeTruthy();
    });
    // Under the cap the sweep is a no-op: the hidden channel is still there.
    const stats = (await mockInvoke('hidden_channel_stats')) as unknown as { hidden_channels: number };
    expect(stats.hidden_channels).toBe(1);
  });
});
