// @vitest-environment jsdom
/**
 * Batch 4 item 9 (owner 2026-11-02): "echoprism needs a loading splash screen
 * with the animated pulsating logo and current version number shown while the
 * app loads." SplashScreen renders the pulsing PrismLogo + the version from
 * package.json (the synced version surface).
 *
 * Discriminant: a splash without the version (or without the pulse class)
 * fails; a version that disagrees with package.json fails.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// @ts-expect-error the repo does not ship @types/node (same as app-icon-sync.test.tsx)
import { readFileSync } from 'node:fs';
import { SplashScreen } from '../components/SplashScreen';
import App, { SPLASH_MIN_MS } from '../App';
import { settingsCommands } from '../hooks/useTauriCommands';
import { resetMockState } from '../mocks/router';
import pkg from '../../package.json';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SplashScreen (batch 4 item 9)', () => {
  it('shows the pulsing logo and the current version while loading', () => {
    const { container } = render(<SplashScreen />);
    const splash = screen.getByTestId('splash-screen');
    expect(splash.getAttribute('aria-label')).toBe(`EchoPrism v${pkg.version} is loading`);
    expect(screen.getByText(`EchoPrism v${pkg.version}`)).toBeTruthy();
    // The logo IS the svg and carries the pulse animation class.
    const logo = container.querySelector('svg.animate-pulse');
    expect(logo).toBeTruthy();
  });
});

describe('Round 6 Task 6: a splash the owner actually sees [echoprism-splash-screen]', () => {
  function renderApp() {
    resetMockState();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>,
    );
  }

  function mockInitResolvingAt() {
    let resolveGet: ((v: unknown) => void) | undefined;
    vi.spyOn(settingsCommands, 'get').mockImplementation(
      () =>
        new Promise((res) => {
          resolveGet = res as unknown as (v: unknown) => void;
        }),
    );
    return () => resolveGet?.({});
  }

  it('keeps the splash for SPLASH_MIN_MS even when init resolves at 10 ms', async () => {
    vi.useFakeTimers();
    const resolveInit = mockInitResolvingAt();
    renderApp();
    expect(screen.getByTestId('splash-screen')).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(10);
      resolveInit();
      await Promise.resolve();
    });
    // Init finished at ~10 ms, but the minimum display time has not elapsed.
    await act(async () => {
      vi.advanceTimersByTime(SPLASH_MIN_MS - 11); // t = 899 ms
    });
    expect(screen.getByTestId('splash-screen'), 'still shown at 899 ms').toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(2); // t = 901 ms
    });
    expect(screen.queryByTestId('splash-screen'), 'gone at 901 ms').toBeNull();
  });

  it('keeps the splash while init is still pending (init resolves at 2000 ms)', async () => {
    vi.useFakeTimers();
    const resolveInit = mockInitResolvingAt();
    renderApp();
    await act(async () => {
      vi.advanceTimersByTime(1999);
    });
    expect(screen.getByTestId('splash-screen'), 'shown at 1999 ms while init pending').toBeTruthy();
    await act(async () => {
      resolveInit();
      vi.advanceTimersByTime(2); // t = 2001 ms; init at 2000 ms > SPLASH_MIN_MS
      await Promise.resolve();
    });
    expect(screen.queryByTestId('splash-screen'), 'gone once init lands past the floor').toBeNull();
  });

  it('index.html ships a static pre-splash inside #root, so the first frame is not blank', () => {
    // vitest runs from the repo root.
    const html = readFileSync('index.html', 'utf8') as string;
    const m = /<div id="root">([\s\S]*?)<\/div>/.exec(html);
    expect(m, 'index.html has a #root div').not.toBeNull();
    const inner = m?.[1] ?? '';
    expect(inner).toContain('id="pre-splash"');
    // The prism triangle geometry, copied from PrismLogo's PRISM_GEOMETRY.
    expect(inner).toContain('60.00,8.00');
  });
});
