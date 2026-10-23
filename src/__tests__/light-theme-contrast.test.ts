/**
 * Phase B (light theme): the light palette is MEASURED, not eyeballed —
 * 2a's discipline applied to the new surface. This test parses the
 * `html.light` token block out of src/index.css and computes WCAG ratios
 * for every pairing the dark theme's audit cared about: normal text,
 * muted text on its real surfaces, each hue in its text role, text-inverse
 * on the solid accent, and the non-text 3:1 pairs (focus ring, strong
 * border).
 *
 * Discriminant (mutation-checked): lowering any light token to a
 * failing value (e.g. accent back to the dark theme's neon #10F0A8)
 * must fail the corresponding assertion.
 */

// The repo does not ship @types/node; read via the same escape hatch as
// the contract test.
// @ts-expect-error no @types/node in this repo (see tauri-command-contract)
import { readFileSync } from 'node:fs';
// @ts-expect-error no @types/node
import path from 'node:path';
// @ts-expect-error no @types/node
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const cssPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.css');
const css = readFileSync(cssPath, 'utf8') as string;

function lightTokens(): Record<string, string> {
  const block = css.match(/html\.light\s*\{([\s\S]*?)\}/);
  if (block === null) {
    throw new Error('no html.light token block in src/index.css — the light palette is missing');
  }
  const tokens: Record<string, string> = {};
  for (const m of block[1].matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    tokens[m[1]] = m[2].trim();
  }
  return tokens;
}

/** sRGB channel → relative luminance component. */
function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Alpha-composite `rgba(r,g,b,a)` over an opaque base hex. */
function over(fg: string, base: string): string {
  const m = fg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
  if (m === null) return fg;
  const mix = (ch: string, i: number) =>
    Math.round(Number(ch) * Number(m[4]) + parseInt(base.replace('#', '').slice(i * 2, i * 2 + 2), 16) * (1 - Number(m[4])));
  const rgb = [mix(m[1], 0), mix(m[2], 1), mix(m[3], 2)];
  return '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
}

describe('Phase B: the light palette is contrast-measured (2a discipline)', () => {
  const t = lightTokens();

  // Opaque bases for the soft washes.
  const bg = t['color-bg'];
  const surface = t['color-surface'];
  const surfaceHover = t['color-surface-hover'];

  const pairsAA: Array<[string, string, string]> = [
    // [token, base, what this pair is]
    ['color-text', bg, 'text on background'],
    ['color-text', surface, 'text on surface'],
    ['color-text-muted', bg, 'muted text on background'],
    ['color-text-muted', surfaceHover, 'muted text on hover surface (the 2a fix, light-side)'],
    ['color-accent', bg, 'accent as text on background'],
    ['color-accent', surface, 'accent as text on surface'],
    ['color-audio', bg, 'audio hue as text'],
    ['color-video', bg, 'video hue as text'],
    ['color-danger', bg, 'danger as text'],
    ['color-danger', surface, 'danger as text on surface'],
    ['color-danger', over(t['color-danger-soft'], bg), 'danger as badge text on its soft wash'],
    ['color-success', bg, 'success as text'],
    ['color-warning', bg, 'warning as text'],
    ['color-warning', over(t['color-warning-soft'], bg), 'warning as text on its soft wash'],
    ['color-warning-strong', bg, 'strong warning as text'],
    ['color-text-inverse', t['color-accent'], 'inverse text on the solid accent'],
    // Badge pairs — DERIVED from the real components (InstanceCard.tsx:40,
    // InstanceHealthGrid.tsx:26, feed/EpisodeCard.tsx:75 render
    // `bg-<hue>-soft text-<hue>` badges on surface cards): each hue as text
    // on its own soft wash composited over the surface. Caught live by the
    // axe scan after the first light palette measured 4.03/4.12 here.
    ['color-audio', over(t['color-audio-soft'], surface), 'audio badge text on its wash over surface'],
    ['color-video', over(t['color-video-soft'], surface), 'video badge text on its wash over surface'],
    ['color-warning', over(t['color-warning-soft'], surface), 'warning badge text on its wash over surface'],
    ['color-danger', over(t['color-danger-soft'], surface), 'danger badge text on its wash over surface'],
  ];
  const pairsAAlarge: Array<[string, string, string]> = [
    // 3:1 (non-text UI / large): focus ring visibility, strong borders.
    ['color-focus-ring', bg, 'focus ring against the background'],
    ['color-border-strong', bg, 'strong border against the background'],
  ];

  it.each(pairsAA)('--%s on %s (%s) ≥ 4.5:1', (token, base, what) => {
    const r = ratio(t[token], base);
    expect(r, `${what}: --${token} ${t[token]} on ${base} measured ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it.each(pairsAAlarge)('--%s vs %s (%s) ≥ 3:1 (non-text)', (token, base, what) => {
    const r = ratio(t[token], base);
    expect(r, `${what}: measured ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
  });

  it('the light block is a full palette: every dark COLOR token has a light counterpart', () => {
    // Tailwind v4: the dark palette is declared in @theme (emitted to :root).
    const darkBlock = css.match(/@theme\s*\{([\s\S]*?)\}/);
    if (darkBlock === null) throw new Error('no @theme block found');
    // Colors need light counterparts; fonts and elevation shadows stay shared.
    const darkTokens = [...darkBlock[1].matchAll(/--(color-[\w-]+):/g)].map((m) => m[1]);
    const light = lightTokens();
    const missing = darkTokens.filter((name) => !(name in light));
    expect(missing, `tokens without a light override: ${missing.join(', ')}`).toEqual([]);
  });
});
