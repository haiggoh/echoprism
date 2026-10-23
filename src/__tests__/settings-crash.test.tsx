// @vitest-environment jsdom
/**
 * 4f (Phase C): the Settings crash-reports section is honest by
 * construction — capture is always local (nothing uploads), the "file a
 * report" affordance exists only when opted in AND a capture exists, and
 * the issue URL carries the signature the triage Action groups by.
 *
 * Discriminants: opting in with no captures renders no file button; the
 * button's URL must be the prefilled issues/new with the signature; the
 * opt-out hides the button again.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SettingsScreen } from '../components/screens/SettingsScreen';
import { ThemeProvider } from '../hooks/useTheme';
import { ConvergenceProvider } from '../hooks/useConvergence';
import { crashCommands } from '../hooks/useTauriCommands';
import { crashIssueUrl } from '../lib/crashIssue';
import { resetMockState } from '../mocks/router';
import type { CrashRecord } from '../types';

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ThemeProvider>
          <ConvergenceProvider>
            <SettingsScreen />
          </ConvergenceProvider>
        </ThemeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  resetMockState();
  try {
    window.localStorage?.removeItem('crashReportingOptIn');
  } catch { /* jsdom without storage */ }
});

afterEach(() => cleanup());

function openPreferences() {
  fireEvent.click(screen.getByRole('tab', { name: 'Preferences' }));
  return waitFor(() => expect(screen.getByText('Crash reports')).toBeTruthy());
}

describe('4f: crash reports are local-first and opt-in for submission', () => {
  it('defaults to opt-OUT: no file-issue button even with a capture present', async () => {
    renderSettings();
    await openPreferences();
    expect(screen.queryByRole('button', { name: /file github issue/i })).toBeNull();
  });

  it('opting in reveals the last capture and the prefilled issue button', async () => {
    renderSettings();
    await openPreferences();

    fireEvent.click(screen.getByRole('checkbox', { name: /help me file crash reports/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /file github issue/i })).toBeTruthy();
    });
    expect(screen.getByText(/fixture crash for the settings section/i)).toBeTruthy();

    // The click routes through open_external_url with the builder's URL —
    // spied here; the pure builder's encoding is asserted below.
    const openSpy = vi.spyOn(crashCommands, 'openExternalUrl').mockResolvedValue();
    fireEvent.click(screen.getByRole('button', { name: /file github issue/i }));
    await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1));
    const url = openSpy.mock.calls[0][0];
    expect(url.startsWith('https://github.com/haiggoh/echoprism/issues/new?')).toBe(true);
    expect(decodeURIComponent(url)).toContain('crash: panic');
    expect(decodeURIComponent(url)).toContain('fixture crash');
  });

  it('opting out hides the submission affordance again', async () => {
    renderSettings();
    await openPreferences();
    fireEvent.click(screen.getByRole('checkbox', { name: /help me file crash reports/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /file github issue/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('checkbox', { name: /help me file crash reports/i }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /file github issue/i })).toBeNull();
    });
  });
});

describe('crashIssueUrl (pure builder)', () => {
  const record: CrashRecord = {
    kind: 'panic',
    signature: 'abc123',
    message: 'panicked at src/main.rs:42:10:\nboom',
    app_version: '0.1.0',
    at: '2026-10-23T00:00:00Z',
  };

  it('builds a prefilled issues/new URL with the signature title and the report body', () => {
    const url = crashIssueUrl(record);
    expect(url.startsWith('https://github.com/haiggoh/echoprism/issues/new?')).toBe(true);
    expect(url).toContain(encodeURIComponent('crash: panic abc123'));
    expect(url).toContain(encodeURIComponent('```'));
    expect(decodeURIComponent(url)).toContain('boom');
  });

  it('URL-encodes newlines and special characters safely', () => {
    const url = crashIssueUrl({ ...record, message: 'boom\nline2 & more' });
    expect(url).not.toMatch(/\n/);
    expect(decodeURIComponent(url)).toContain('line2 & more');
  });
});
