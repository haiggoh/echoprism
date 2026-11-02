import { PrismLogo } from './ui/PrismLogo';
// resolveJsonModule is on; package.json is the single version source synced
// with tauri.conf.json / Cargo.toml at every release.
import pkg from '../../package.json';

/**
 * Loading splash (owner request 2026-11-02): the animated pulsating brand logo
 * with the current version, shown while the app initialises (before the first
 * preferences read resolves). Pure presentational — App owns visibility.
 */
export function SplashScreen() {
  return (
    <div
      className="flex h-screen w-full flex-col items-center justify-center bg-bg"
      data-testid="splash-screen"
      role="status"
      aria-label={`EchoPrism v${pkg.version} is loading`}
    >
      <PrismLogo size={112} className="animate-pulse" />
      <p className="mt-6 text-sm text-text-muted tabular-nums">EchoPrism v{pkg.version}</p>
    </div>
  );
}
