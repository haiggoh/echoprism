// @vitest-environment jsdom
/**
 * 2026-11-18: Settings → subtitles. Contract: OFF by default; the checkbox
 * sends a one-field patch; the language select sends a one-field patch and is
 * disabled while subtitles are off.
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

describe('2026-11-18: subtitles settings', () => {
  it('subtitles are off by default and the language select is disabled', async () => {
    renderSettings();
    fireEvent.click(screen.getByRole('tab', { name: 'Preferences' }));
    const cb = (await screen.findByLabelText('Show subtitles')) as HTMLInputElement;
    await waitFor(() => expect(cb.checked).toBe(false));
    await waitFor(() => expect((screen.getByLabelText('Subtitle language') as HTMLSelectElement).disabled, 'language select disabled while subtitles off').toBe(true));
  });

  it('checking subtitles sends the patch and enables the language select', async () => {
    renderSettings();
    fireEvent.click(screen.getByRole('tab', { name: 'Preferences' }));
    const cb = (await screen.findByLabelText('Show subtitles')) as HTMLInputElement;
    fireEvent.click(cb);
    await waitFor(() => {
      const calls = vi
        .mocked(mockInvoke)
        .mock.calls.filter(([cmd]) => cmd === 'update_settings')
        .map(([, args]) => (args as { prefs: Record<string, unknown> }).prefs);
      expect(calls.some((p) => p?.subtitles_enabled === true)).toBe(true);
    });
    await waitFor(() => expect((screen.getByLabelText('Subtitle language') as HTMLSelectElement).disabled).toBe(false));

    fireEvent.change(screen.getByLabelText('Subtitle language'), { target: { value: 'de' } });
    await waitFor(() => {
      const calls = vi
        .mocked(mockInvoke)
        .mock.calls.filter(([cmd]) => cmd === 'update_settings')
        .map(([, args]) => (args as { prefs: Record<string, unknown> }).prefs);
      expect(calls.some((p) => p?.subtitle_language === 'de')).toBe(true);
    });
  });
});
