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
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SplashScreen } from '../components/SplashScreen';
import pkg from '../../package.json';

afterEach(cleanup);

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
