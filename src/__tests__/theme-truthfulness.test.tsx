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
      matches: query.includes('dark') ? prefersDark : false,
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
  it('offers only themes that exist, and says why light is absent', async () => {
    renderSettings();
    openPreferencesTab();
    await waitFor(() => expect(screen.getByText('Theme')).toBeTruthy());

    const group = screen.getByText('Theme').closest('div') as HTMLElement;
    const values = within(group)
      .getAllByRole('radio')
      .map((el) => (el as HTMLInputElement).value);

    expect(values).toContain('dark');
    expect(values).toContain('system');
    expect(values).not.toContain('light');
    expect(within(group).getByText(/light theme is not designed yet/i)).toBeTruthy();
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

  it('resolves a light-preferring OS to the app dark theme, never the unstyled class', async () => {
    stubMatchMedia(false); // OS prefers LIGHT — the app has no light palette
    renderSettings();
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });
});
