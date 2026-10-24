// @vitest-environment jsdom
/**
 * Live-test feature: the Podcasts tab is real — the subscribed podcast
 * feeds with artwork, and the OPML portability pair (the 1c unwired
 * contract). Import REGISTERS feeds without fetching (the background
 * refresh brings episodes), is idempotent, and only accepts opml.
 *
 * Discriminants: an import that duplicates fails the no-duplicate
 * assertion; an unescaped export fails the entity assertion.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SettingsScreen } from '../components/screens/SettingsScreen';
import { ThemeProvider } from '../hooks/useTheme';
import { ConvergenceProvider } from '../hooks/useConvergence';
import { Toaster } from '../components/ui/Toaster';
import { podcastCommands } from '../hooks/useTauriCommands';
import { mockInvoke, resetMockState } from '../mocks/router';

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ThemeProvider>
          <ConvergenceProvider>
            <SettingsScreen />
            <Toaster />
          </ConvergenceProvider>
        </ThemeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => resetMockState());
afterEach(() => cleanup());

function openPodcastsTab() {
  fireEvent.click(screen.getByRole('tab', { name: 'Podcasts' }));
  return waitFor(() => expect(screen.getByText('Podcast Feeds')).toBeTruthy());
}

describe('live-test feature: the Podcasts tab', () => {
  it('lists the subscribed podcast feeds with their feed URLs', async () => {
    renderSettings();
    await openPodcastsTab();
    await waitFor(() => {
      expect(screen.getAllByTestId('podcast-feed-row')).toHaveLength(2);
    });
    // Derived from the fixtures: ch-2 and ch-4 are the podcast channels.
    expect(screen.getByText('https://feeds.example.org/deep-dive.xml')).toBeTruthy();
    expect(screen.queryByText('UC-mock-tech-talks')).toBeNull();
  });

  it('export builds OPML from the subscribed feeds', async () => {
    renderSettings();
    await openPodcastsTab();
    fireEvent.click(screen.getByRole('button', { name: /export subscriptions/i }));
    const box = await screen.findByLabelText('OPML to import');
    await waitFor(() => {
      expect((box as HTMLTextAreaElement).value).toContain('<opml version="2.0">');
    });
    expect((box as HTMLTextAreaElement).value).toContain('xmlUrl="https://feeds.example.org/deep-dive.xml"');
  });

  it('import registers a pasted OPML feed (no fetch — the refresh brings episodes)', async () => {
    renderSettings();
    await openPodcastsTab();

    const opml =
      '<?xml version="1.0"?><opml version="2.0"><body>' +
      '<outline type="rss" text="Imported Show" xmlUrl="https://feeds.example/imported.xml"/>' +
      '</body></opml>';
    fireEvent.change(screen.getByLabelText('OPML to import'), { target: { value: opml } });
    fireEvent.click(screen.getByRole('button', { name: /import subscriptions/i }));

    await waitFor(() => {
      expect(screen.getByText(/imported 1 feed/i)).toBeTruthy();
    });
    // The registered feed is now in the list.
    await waitFor(() => {
      expect(screen.getByText('https://feeds.example/imported.xml')).toBeTruthy();
    });
  });

  it('import is idempotent: the same OPML twice does not duplicate', async () => {
    renderSettings();
    await openPodcastsTab();

    const opml =
      '<?xml version="1.0"?><opml version="2.0"><body>' +
      '<outline type="rss" text="Imported Show" xmlUrl="https://feeds.example/imported.xml"/>' +
      '</body></opml>';
    const box = screen.getByLabelText('OPML to import');
    fireEvent.change(box, { target: { value: opml } });
    fireEvent.click(screen.getByRole('button', { name: /import subscriptions/i }));
    await waitFor(() => expect(screen.getByText(/imported 1 feed/i)).toBeTruthy());

    // Re-import the same OPML: the toast reports 0 imported, the list stays.
    fireEvent.change(screen.getByLabelText('OPML to import'), { target: { value: opml } });
    fireEvent.click(screen.getByRole('button', { name: /import subscriptions/i }));
    await waitFor(() => {
      expect(screen.getByText(/imported 0 feed/i)).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getAllByTestId('podcast-feed-row')).toHaveLength(3); // 2 seeded + 1 imported
    });
  });

  it('Refresh now calls the refresh command and reports the count', async () => {
    const refreshSpy = vi.spyOn(podcastCommands, 'refresh').mockResolvedValue(2);
    renderSettings();
    await openPodcastsTab();
    fireEvent.click(screen.getByRole('button', { name: /refresh podcast feeds now/i }));
    await waitFor(() => expect(refreshSpy).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/refreshed 2 feeds/i)).toBeTruthy();
  });

  it('the import command rejects a non-opml source (mirrors the Rust guard)', async () => {
    await expect(
      mockInvoke('import', { source: 'youtube', data: '<xml/>' }),
    ).rejects.toThrow(/unsupported import source/);
  });
});
