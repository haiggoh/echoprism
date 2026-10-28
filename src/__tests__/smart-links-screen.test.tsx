// @vitest-environment jsdom
/**
 * 2c: the Smart Links screen was a static stub — a heading, a "Run Matching"
 * button that did nothing, and a permanent empty state — even though 1d
 * shipped and tested the whole backend (list/match/confirm/unlink). The
 * screen now lists the links, runs the matcher, confirms and unlinks.
 *
 * Discriminants: removing the query leaves the seeded rows unrendered;
 * rewiring the buttons to no-ops fails the confirm/unlink round-trips (the
 * mock handlers are the Rust semantics: flip user_confirmed / delete by id).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SmartLinksScreen } from '../components/screens/SmartLinksScreen';
import { MemoryRouter } from 'react-router-dom';
import { SettingsScreen } from '../components/screens/SettingsScreen';
import { smartLinkCommands } from '../hooks/useTauriCommands';
import { resetMockState } from '../mocks/router';

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SmartLinksScreen />
    </QueryClientProvider>
  );
}

beforeEach(() => resetMockState());
afterEach(() => cleanup());

describe('2c: Smart Links screen', () => {
  it('lists the existing links with their confidence', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('smart-link-row').length).toBeGreaterThan(0);
    });
    // The seeded pair from the mock DB is visible with its confidence.
    expect(screen.getByText(/92% confidence/)).toBeTruthy();
  });

  it('confirm toggles a link, unlink removes it', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getAllByTestId('smart-link-row').length).toBeGreaterThan(0));
    const rowsBefore = screen.getAllByTestId('smart-link-row').length;

    fireEvent.click(screen.getAllByRole('button', { name: /confirm/i })[0]);
    await waitFor(() => {
      expect(screen.getAllByText(/confirmed/i).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole('button', { name: /unlink/i })[0]);
    await waitFor(() => {
      expect(screen.getAllByTestId('smart-link-row').length).toBe(rowsBefore - 1);
    });
  });

  it('surfaces an error state when the list fails, not a silent empty', async () => {
    const spy = vi
      .spyOn(smartLinkCommands, 'list')
      .mockRejectedValueOnce(new Error('boom'));
    try {
      renderScreen();
      await waitFor(() => {
        expect(screen.getByText(/couldn't load/i)).toBeTruthy();
      });
      expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });
});

/**
 * Live-test Task 5: "smart links seems to work but it doesn't show user-readable
 * title (only shows long id strings the user doesn't know how to judge)".
 *
 * The panel printed `{podcast_guid} ↔ {youtube_video_id}` — opaque ids on both
 * sides. It now shows each side's episode TITLE when the episode is local, and
 * falls back to the raw id (monospace, muted) when it is not.
 *
 * Discriminant: reverting the panel to the raw-id line fails the first test;
 * asserting a link's row keeps the ids would fail the fallback test, because
 * that row has no local episode on either side.
 */
describe('Live-test Task 5: Smart Links are human-readable', () => {
  it('shows both episode titles instead of the raw ids', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('smart-link-row').length).toBeGreaterThan(0);
    });

    // link-1 pairs the deep-dive podcast episode with the Invidious video —
    // both are local, so BOTH real titles must render.
    expect(screen.getByText(/Episode 42 — RSS is winning again/)).toBeTruthy();
    expect(screen.getByText(/How Invidious pools actually work/)).toBeTruthy();

    // The raw ids must NOT be the row's headline any more.
    const row = screen.getAllByTestId('smart-link-row')[0];
    expect(row.textContent).not.toMatch(/deep-dive-042/);
  });

  it('falls back to the raw ids when neither episode is local', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('smart-link-row').length).toBeGreaterThan(0);
    });

    // link-4 has no local episode on either side: the ids ARE the only honest
    // label, and the row must still exist (an unlocal link is still a link).
    const unlocal = screen.getAllByTestId('smart-link-row')
      .find((r) => r.textContent?.includes('guid-no-local-episode'));
    expect(unlocal, 'the unlocal link row is rendered').toBeTruthy();
    expect(unlocal?.textContent).toMatch(/vid-no-local-episode/);
    // ...and it must not be styled as a readable title: the fallback id is
    // monospace + muted, which is the visual contract for "no title".
    expect(unlocal?.querySelector('.font-mono')).toBeTruthy();
  });

  it("names the row's actions with the title, not the opaque guid", async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('smart-link-row').length).toBeGreaterThan(0);
    });

    // The owner's complaint was about ids a person "doesn't know how to judge".
    // A screen-reader user hears the row's BUTTON names, not the rendered
    // text — so an action still labelled with the raw guid is the exact same
    // defect on a different surface. (Live-test Task 5's follow-up.)
    expect(
      screen.getByRole('button', { name: /Confirm link .*Episode 42 — RSS is winning again/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Unlink .*Episode 42 — RSS is winning again/i }),
    ).toBeTruthy();
    // No button may still name the raw guid for a link that HAS a title.
    expect(screen.queryByRole('button', { name: /deep-dive-042/ })).toBeNull();
  });
});

/**
 * Phase 6: Settings > Smart Links renders the SAME real panel, not the stub it
 * was — a heading, a dead "Run Matching" button and a permanent EmptyState,
 * while this screen beside it was fully wired. The 2c static-stub defect,
 * surviving in the one place nobody re-checked after 2c.
 *
 * Discriminant: pointing the Settings tab back at the placeholder fails these;
 * asserting a real row is enough, because the stub renders no rows at all.
 */

describe('Phase 6: Settings > Smart Links is the real panel', () => {
  /** Settings renders at /settings; the tab is reached by its own button. */
  function renderSettingsOnSmartLinks() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/settings']}>
          <SettingsScreen />
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  it('the tab lists real links, not a permanent empty state', async () => {
    renderSettingsOnSmartLinks();
    fireEvent.click(screen.getByRole('tab', { name: /smart links/i }));

    await waitFor(() => {
      expect(screen.getAllByTestId('smart-link-row').length).toBeGreaterThan(0);
    });
    expect(screen.getByText(/92% confidence/)).toBeTruthy();
  });

  it('Run Matching in the tab actually mutates — the button is not a no-op', async () => {
    renderSettingsOnSmartLinks();
    fireEvent.click(screen.getByRole('tab', { name: /smart links/i }));
    await waitFor(() => expect(screen.getAllByTestId('smart-link-row').length).toBeGreaterThan(0));

    const spy = vi.spyOn(smartLinkCommands, 'match').mockResolvedValue({ matched_count: 1 });
    fireEvent.click(screen.getByRole('button', { name: /^run matching$/i }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    spy.mockRestore();
  });
});
