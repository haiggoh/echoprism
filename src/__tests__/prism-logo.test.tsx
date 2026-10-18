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
import { PrismLogo } from '../components/ui/PrismLogo';

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
});
