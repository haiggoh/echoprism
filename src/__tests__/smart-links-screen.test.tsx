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
