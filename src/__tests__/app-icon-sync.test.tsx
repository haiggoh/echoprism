// @vitest-environment jsdom
/**
 * App icon sync (owner 2026-10-19 18:19): the in-app sidebar icon and the
 * dock/app icon must never drift apart again. Both are <PrismAppIcon>, and
 * design/brand/prism-icon.svg is GENERATED from it. These tests fail if:
 *  - the committed dock SVG is stale (component changed, build not re-run):
 *    regenerate with `npx vite-node design/brand/build-dock-icon.tsx --png
 *    /tmp/icon.png && npx tauri icon /tmp/icon.png`;
 *  - the sidebar stops using the shared component (a private badge again).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
// @ts-expect-error the repo does not ship @types/node (same as tauri-command-contract.test.ts)
import { readFileSync } from 'node:fs';
// @ts-expect-error the repo does not ship @types/node
import path from 'node:path';
// @ts-expect-error the repo does not ship @types/node
import { fileURLToPath } from 'node:url';
import { MemoryRouter } from 'react-router-dom';
import { PrismAppIcon } from '../components/ui/PrismAppIcon';
import { Sidebar } from '../components/Sidebar';

afterEach(cleanup);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const COLORS: Record<string, string> = {
  'var(--color-stream-audio)': '#00D4C8',
  'var(--color-stream-video)': '#FF8C42',
  'var(--color-bg)': '#0A0E1A',
};

/** Normalise a rendered icon for comparison: drop what the build adds
 *  (xmlns, the GENERATED comment) and the per-render useId values, keep
 *  EVERYTHING else. Comparing only path data missed layout changes carried
 *  by attributes (the mark's nested <svg> x/y/width), measured 2026-10-19. */
function normalise(svg: string): string {
  return svg
    .replace(/ xmlns="[^"]*"/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\bR[0-9a-z]+-/g, 'ID-')
    .replace(/>\s+</g, '><')
    .trim();
}

describe('app icon sync', () => {
  it('the committed dock icon SVG is what <PrismAppIcon margin> renders now', () => {
    let fresh = renderToStaticMarkup(<PrismAppIcon size={1024} margin displayPx={128} />);
    for (const [v, hex] of Object.entries(COLORS)) fresh = fresh.split(v).join(hex);
    const committed = readFileSync(path.join(repoRoot, 'design/brand/prism-icon.svg'), 'utf8') as string;
    expect(committed.length).toBeGreaterThan(2000);
    expect(normalise(committed)).toBe(normalise(fresh));
  });

  it('the sidebar shows the shared app icon, not a private badge', () => {
    const { getAllByTestId } = render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );
    expect(getAllByTestId('prism-app-icon').length).toBeGreaterThanOrEqual(1);
  });

  it('audioOnly mode renders the headphones mark, not a paled prism glyph (batch 4 item 2)', () => {
    // Owner 2026-11-02: switching to audio showed an undecipherable pale glyph;
    // the consciously chosen replacement is the headphones silhouette.
    const { container } = render(<PrismAppIcon size={64} audioOnly />);
    // Scope to this render's container — a second render appends to document.body.
    const within1 = within(container);
    expect(within1.getByTestId('headphones-mark')).toBeTruthy();
    // The prism mark paths are gone in audio mode.
    expect(within1.queryByTestId('mark-combined')).toBeNull();
    expect(within1.queryByTestId('mark-video-beam')).toBeNull();

    // Video mode keeps the prism mark and no headphones.
    const { container: c2 } = render(<PrismAppIcon size={64} />);
    const within2 = within(c2);
    expect(within2.queryByTestId('headphones-mark')).toBeNull();
    expect(within2.queryByTestId('mark-combined')).toBeTruthy();
  });
});
