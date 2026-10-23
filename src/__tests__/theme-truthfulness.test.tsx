// @vitest-environment jsdom
/**
 * 2a design audit — the theme control must be truthful.
 *
 * Before this change the Settings theme radios wrote the DB preference
 * (update_settings { theme }) which nothing reads, while the live theme
 * mechanism (ThemeProvider, applied at main.tsx) reads and writes
 * localStorage and was never called by the control: picking a theme changed
 * nothing. The 'light' option was doubly inert — src/index.css defines no
 * light rules at all, so the provider's `light` class matched zero styles
 * (brand.md defines a dark-first palette only).
 *
 * Discriminants: restoring the DB-only write fails the class/localStorage
 * assertions; re-adding a 'light' option fails the option assertion; making
 * the provider honour a light OS preference fails the system-resolution
 * assertion.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SettingsScreen } from '../components/screens/SettingsScreen';
import { ThemeProvider } from '../hooks/useTheme';
import { resetMockState } from '../mocks/router';

/** jsdom in this repo runs without a localStorage global (the provider's
 *  guarded access tolerates that); the persistence assertion needs a real
 *  one, so provide a minimal in-memory double. */
function stubStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  });
}

function stubMatchMedia(prefersDark: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      // Phase B: answer the light query too — the stub predates the light
      // theme and only spoke for 'dark'.
      matches: query.includes('dark') ? prefersDark : query.includes('light') ? !prefersDark : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <SettingsScreen />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function openPreferencesTab() {
  fireEvent.click(screen.getByRole('tab', { name: 'Preferences' }));
}

beforeEach(() => {
  resetMockState();
  stubStorage();
  document.documentElement.classList.remove('light', 'dark');
  stubMatchMedia(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('2a: the Settings theme control is truthful', () => {
  it('offers exactly the themes that exist (Phase B: light now does)', async () => {
    renderSettings();
    openPreferencesTab();
    await waitFor(() => expect(screen.getByText('Theme')).toBeTruthy());

    const group = screen.getByText('Theme').closest('div') as HTMLElement;
    const values = within(group)
      .getAllByRole('radio')
      .map((el) => (el as HTMLInputElement).value);

    expect(values).toContain('dark');
    expect(values).toContain('system');
    // Phase B: the light palette EXISTS now (contrast-measured — see
    // light-theme-contrast.test.ts), so the option is offered again.
    expect(values).toContain('light');
    expect(within(group).queryByText(/not designed yet/i)).toBeNull();
  });

  it('applies the chosen theme through the real mechanism (class + localStorage)', async () => {
    renderSettings();
    openPreferencesTab();
    await waitFor(() => expect(screen.getByText('Theme')).toBeTruthy());

    const group = screen.getByText('Theme').closest('div') as HTMLElement;
    const darkRadio = within(group)
      .getAllByRole('radio')
      .find((el) => (el as HTMLInputElement).value === 'dark') as HTMLInputElement;
    fireEvent.click(darkRadio);

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
    expect(window.localStorage.getItem('theme')).toBe('dark');
  });

  it('Phase B: choosing light applies the light class and persists it', async () => {
    renderSettings();
    openPreferencesTab();
    await waitFor(() => expect(screen.getByText('Theme')).toBeTruthy());

    const group = screen.getByText('Theme').closest('div') as HTMLElement;
    const lightRadio = within(group)
      .getAllByRole('radio')
      .find((el) => (el as HTMLInputElement).value === 'light') as HTMLInputElement;
    fireEvent.click(lightRadio);

    await waitFor(() => {
      expect(document.documentElement.classList.contains('light')).toBe(true);
    });
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(window.localStorage.getItem('theme')).toBe('light');
  });

  it('Phase B: a light-preferring OS resolves to the light theme (system resolution)', async () => {
    stubMatchMedia(false); // OS prefers LIGHT
    renderSettings();
    await waitFor(() => {
      expect(document.documentElement.classList.contains('light')).toBe(true);
    });
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});

describe('Phase B: Settings offers no control for a feature that does not exist', () => {
  // The cross-device sync toggle persisted
  // preferences.cross_device_sync_enabled, which NOTHING reads (verified
  // 2026-10-22, 2a known-gap list; re-verified before this change). A
  // control for an unbuilt feature is dishonest UI — it is hidden, not
  // implemented; the schema field stays (no data migration). The RED run
  // against the toggle-present code is this test's own mutation check:
  // reverting the removal reproduces it exactly.
  it('the cross-device sync toggle is absent', async () => {
    renderSettings();
    openPreferencesTab();
    await waitFor(() => expect(screen.getByText('Theme')).toBeTruthy());
    expect(screen.queryByText(/cross-device sync/i)).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /cross-device sync/i })).toBeNull();
  });
});
