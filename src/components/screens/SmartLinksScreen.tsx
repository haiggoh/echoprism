import { SmartLinksPanel } from '../smartlinks/SmartLinksPanel';

/**
 * 2c: this screen was a static stub (heading + inert button + permanent
 * empty state) while 1d had shipped the whole backend. It now renders the real
 * panel — list, run the matcher, confirm/unlink — with the loading/error/empty
 * states every data screen needs (2c).
 *
 * Phase 6: the panel itself moved to smartlinks/SmartLinksPanel so Settings >
 * Smart Links can render the SAME implementation rather than its own stub copy.
 * The screen owns only the scroll container; everything inside — including the
 * heading and Run Matching — is the panel, so the two surfaces cannot drift.
 * (Rendering the panel twice to split header from body would duplicate the
 * query and the buttons; one self-contained panel is the simpler contract.)
 */
export function SmartLinksScreen() {
  return (
    <div className="h-full overflow-auto p-4">
      <SmartLinksPanel showHeading headingLevel={1} />
    </div>
  );
}
