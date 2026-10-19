// @vitest-environment jsdom
/**
 * PrismLogo — the brand mark (2026-10-18 owner redesign).
 *
 * Discriminants:
 *  - "pales the video stream in audio-only mode" fails if the audioOnly ->
 *    opacity-0.18 mapping on the video beam is removed (D-spec: "the orange
 *    stream turns a very pale desaturated orange, barely visible").
 *  - "straight beam segments" fails if the beam paths regress to curved
 *    commands (owner: "perfectly straight not curved").
 */
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import {
  PrismLogo,
  PRISM_AUDIO_BEAM,
  PRISM_VIDEO_BEAM,
  PRISM_EXIT_BEAM,
  PRISM_GLASS_BEAM,
  PRISM_EXIT_POINT,
  PRISM_MEET,
  PRISM_TRIANGLE,
} from '../components/ui/PrismLogo';

afterEach(cleanup);

const PALE = '0.18'; // faint trace (owner 2026-10-19: "even more subdued")

describe('PrismLogo', () => {
  it('renders as a decorative mark (hidden from assistive tech)', () => {
    const { container } = render(<PrismLogo />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows both streams saturated by default', () => {
    const { getByTestId } = render(<PrismLogo />);
    expect(getByTestId('mark-audio-beam').getAttribute('opacity')).toBe('1');
    expect(getByTestId('mark-video-beam').getAttribute('opacity')).toBe('1');
  });

  it('pales the video stream in audio-only mode; audio stays saturated', () => {
    const { getByTestId } = render(<PrismLogo audioOnly />);
    const video = getByTestId('mark-video-beam');
    expect(video.getAttribute('opacity')).toBe(PALE);
    expect(video.style.filter).toContain('saturate'); // desaturated, not just dimmed
    expect(getByTestId('mark-audio-beam').getAttribute('opacity')).toBe('1');
  });

  it('uses straight beam segments (no curve commands)', () => {
    const { getByTestId } = render(<PrismLogo />);
    for (const id of ['mark-audio-beam', 'mark-video-beam']) {
      const d = getByTestId(id).getAttribute('d') ?? '';
      expect(d).toMatch(/^[ML\s0-9.-]+$/); // only M/L commands + coordinates
    }
  });

  // v3 geometry invariants (owner 2026-10-19 17:02). Each fails if a beam
  // is hand-edited instead of regenerated from design/brand/prism-geometry.py.
  const nums = (d: string) => d.replace(/[ML,]/g, ' ').trim().split(/\s+/).map(Number);
  const last = (d: string) => nums(d).slice(-2);
  const first = (d: string) => nums(d).slice(0, 2);

  it('the streams cross at the triangle centroid (centre of gravity)', () => {
    const t = nums(PRISM_TRIANGLE);
    const cx = (t[0] + t[2] + t[4]) / 3;
    const cy = (t[1] + t[3] + t[5]) / 3;
    expect(PRISM_MEET.x).toBeCloseTo(cx, 0);
    expect(PRISM_MEET.y).toBeCloseTo(cy, 0);
    expect(last(PRISM_AUDIO_BEAM)).toEqual([PRISM_MEET.x, PRISM_MEET.y]);
    expect(last(PRISM_VIDEO_BEAM)).toEqual([PRISM_MEET.x, PRISM_MEET.y]);
    expect(first(PRISM_GLASS_BEAM)).toEqual([PRISM_MEET.x, PRISM_MEET.y]);
    expect(first(PRISM_EXIT_BEAM)).toEqual([PRISM_EXIT_POINT.x, PRISM_EXIT_POINT.y]);
  });

  it('the white beam leaves level or rising, never falling', () => {
    const [x1, y1, x2, y2] = nums(PRISM_EXIT_BEAM);
    const risingDeg = (Math.atan2(y1 - y2, x2 - x1) * 180) / Math.PI; // y is down
    expect(risingDeg).toBeGreaterThanOrEqual(0);
    expect(risingDeg).toBeLessThanOrEqual(8);
  });

  it('beams run past the viewBox edges (continue to infinity, clipped)', () => {
    expect(first(PRISM_AUDIO_BEAM)[0]).toBeLessThan(0);
    expect(first(PRISM_VIDEO_BEAM)[0]).toBeLessThan(0);
    expect(last(PRISM_EXIT_BEAM)[0]).toBeGreaterThan(120);
  });

  it('the exit beam carries inverted colour fringes (video on top, audio below)', () => {
    const { getByTestId } = render(<PrismLogo size={120} />);
    const top = getByTestId('mark-fringe-top');
    const bottom = getByTestId('mark-fringe-bottom');
    expect(top.getAttribute('stroke')).toBe('var(--color-stream-video)');
    expect(bottom.getAttribute('stroke')).toBe('var(--color-stream-audio)');
    // "top" really is above "bottom" on screen (smaller y at the exit point)
    expect(first(top.getAttribute('d') ?? '')[1]).toBeLessThan(first(bottom.getAttribute('d') ?? '')[1]);
  });

  it('renders the white combined exit beam', () => {
    const { getByTestId } = render(<PrismLogo />);
    expect(getByTestId('mark-exit-beam').getAttribute('stroke')).toBe('#FFFFFF');
  });
});
