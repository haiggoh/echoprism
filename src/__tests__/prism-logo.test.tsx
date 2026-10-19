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
  PRISM_MEET,
} from '../components/ui/PrismLogo';

afterEach(cleanup);

const PALE = '0.35'; // "very pale … barely visible" (desaturated, not just dim)

describe('PrismLogo', () => {
  it('renders as a decorative mark (hidden from assistive tech)', () => {
    const { container } = render(<PrismLogo />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows both streams saturated by default', () => {
    const { getByTestId } = render(<PrismLogo />);
    expect(getByTestId('prism-audio-beam').getAttribute('opacity')).toBe('1');
    expect(getByTestId('prism-video-beam').getAttribute('opacity')).toBe('1');
  });

  it('pales the video stream in audio-only mode; audio stays saturated', () => {
    const { getByTestId } = render(<PrismLogo audioOnly />);
    const video = getByTestId('prism-video-beam');
    expect(video.getAttribute('opacity')).toBe(PALE);
    expect(video.style.filter).toContain('saturate'); // desaturated, not just dimmed
    expect(getByTestId('prism-audio-beam').getAttribute('opacity')).toBe('1');
  });

  it('uses straight beam segments (no curve commands)', () => {
    const { getByTestId } = render(<PrismLogo />);
    for (const id of ['prism-audio-beam', 'prism-video-beam']) {
      const d = getByTestId(id).getAttribute('d') ?? '';
      expect(d).toMatch(/^[ML\s0-9.-]+$/); // only M/L commands + coordinates
    }
  });

  // Refraction redesign (2026-10-19): both streams converge on ONE point of
  // the prism's right face, and the white combined beam leaves from exactly
  // there. Fails if any beam is edited by hand without regenerating the set
  // from design/brand/prism-geometry.py.
  it('both streams end where the white exit beam starts', () => {
    const pts = (d: string) => d.replace(/[ML]/g, ' ').trim().split(/\s+/).map(Number);
    const at = (d: string, i: number) => pts(d).slice(i * 2, i * 2 + 2);
    const last = (d: string) => pts(d).slice(-2);
    expect(last(PRISM_AUDIO_BEAM)).toEqual([PRISM_MEET.x, PRISM_MEET.y]);
    expect(last(PRISM_VIDEO_BEAM)).toEqual([PRISM_MEET.x, PRISM_MEET.y]);
    expect(at(PRISM_EXIT_BEAM, 0)).toEqual([PRISM_MEET.x, PRISM_MEET.y]);
  });

  it('renders the white combined exit beam', () => {
    const { getByTestId } = render(<PrismLogo />);
    expect(getByTestId('prism-exit-beam').getAttribute('stroke')).toBe('#FFFFFF');
  });
});
