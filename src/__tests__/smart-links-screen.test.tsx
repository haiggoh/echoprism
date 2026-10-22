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
