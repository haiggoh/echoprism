// @vitest-environment jsdom
/**
 * Task 5: the Settings → Preferences "Use YouTube's player for video" toggle.
 * Contract: off by default (mock + DB default), and clicking it sends a
 * ONE-FIELD update_settings patch — the backend merges partials.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SettingsScreen } from '../components/screens/SettingsScreen';
import { Toaster } from '../components/ui/Toaster';
import { ThemeProvider } from '../hooks/useTheme';
import { mockInvoke, resetMockState } from '../mocks/router';

vi.mock('../mocks/router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../mocks/router')>();
  return { ...actual, mockInvoke: vi.fn(actual.mockInvoke) };
});

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

beforeEach(() => {
  resetMockState();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Task 5: the YouTube player toggle", () => {
  it('is off by default and clicking it sends a one-field update_settings patch', async () => {
    renderSettings();
    fireEvent.click(screen.getByRole('tab', { name: 'Preferences' }));
    const cb = (await screen.findByLabelText("Use YouTube's player for video")) as HTMLInputElement;
    await waitFor(() => expect(cb.checked, 'default OFF').toBe(false));

    fireEvent.click(cb);
    await waitFor(() => {
      const calls = vi
        .mocked(mockInvoke)
        .mock.calls.filter(([cmd]) => cmd === 'update_settings')
        .map(([, args]) => (args as { prefs: Record<string, unknown> }).prefs);
      expect(
        calls.some((p) => p?.use_youtube_player === true),
        'expected a one-field patch { use_youtube_player: true }',
      ).toBe(true);
    });
  });
});
