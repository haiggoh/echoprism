// @vitest-environment jsdom
/**
 * Task 10: the Settings → Preferences "Playback quality" section. Contract:
 * every control sends a ONE-FIELD patch to update_settings (the backend merges
 * partials), and the mock world reflects the merged prefs.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SettingsScreen } from '../components/screens/SettingsScreen';
import { Toaster } from '../components/ui/Toaster';
import { ThemeProvider } from '../hooks/useTheme';
import { mockInvoke, resetMockState } from '../mocks/router';

// Wrap the real mockInvoke in a vi.fn so the wire shape of each update is
// observable; everything else passes through unchanged.
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

async function openPreferences() {
  fireEvent.click(screen.getByRole('tab', { name: 'Preferences' }));
}

function updateCalls() {
  return vi
    .mocked(mockInvoke)
    .mock.calls.filter(([cmd]) => cmd === 'update_settings')
    .map(([, args]) => (args as { prefs: Record<string, unknown> }).prefs);
}

async function expectOneFieldPatch(patch: Record<string, unknown>) {
  await waitFor(() => {
    expect(updateCalls()).toContainEqual(patch);
  });
  // and it really was ONE field
  const calls = updateCalls();
  const last = calls[calls.length - 1];
  expect(Object.keys(last ?? {})).toEqual(Object.keys(patch));
}

beforeEach(() => {
  resetMockState();
  vi.mocked(mockInvoke).mockClear();
});
afterEach(cleanup);

describe('Settings → Playback quality (Task 10)', () => {
  it('windowed cap select sends a one-field patch (and null = no cap)', async () => {
    renderSettings();
    await openPreferences();
    const sel = await screen.findByLabelText('Windowed video quality cap');
    fireEvent.change(sel, { target: { value: '1080' } });
    await expectOneFieldPatch({ windowed_quality_cap: 1080 });
  });

  it('fullscreen cap select sends a one-field patch; "none" maps to null', async () => {
    renderSettings();
    await openPreferences();
    const sel = await screen.findByLabelText('Fullscreen video quality cap');
    fireEvent.change(sel, { target: { value: 'none' } });
    await expectOneFieldPatch({ fullscreen_quality_cap: null });
  });

  it('start quality select sends a one-field patch', async () => {
    renderSettings();
    await openPreferences();
    const sel = await screen.findByLabelText('Start quality');
    fireEvent.change(sel, { target: { value: 'cap' } });
    await expectOneFieldPatch({ start_quality: 'cap' });
  });

  it('data saver checkbox sends a one-field patch', async () => {
    renderSettings();
    await openPreferences();
    const cb = await screen.findByLabelText(/Data saver/);
    fireEvent.click(cb);
    await expectOneFieldPatch({ data_saver: true });
  });

  it('metered audio-only checkbox + restore select send one-field patches', async () => {
    renderSettings();
    await openPreferences();
    const cb = await screen.findByLabelText(/Audio only on metered/);
    fireEvent.click(cb);
    await expectOneFieldPatch({ audio_only_on_metered: true });
    const sel = await screen.findByLabelText('Back on normal network');
    fireEvent.change(sel, { target: { value: 'ask' } });
    await expectOneFieldPatch({ metered_restore: 'ask' });
  });

  it('podcast tracker toggle sends a one-field patch', async () => {
    renderSettings();
    await openPreferences();
    const cb = await screen.findByLabelText(/Skip podcast tracking redirects/);
    fireEvent.click(cb);
    await expectOneFieldPatch({ skip_podcast_trackers: false });
  });
});
