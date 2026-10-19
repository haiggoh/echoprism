// @vitest-environment jsdom
/**
 * PrismConvergeToggle — the interactive prism mark (2026-10-18 owner redesign).
 *
 * The toggle shares its geometry with PrismLogo (one source of truth for the
 * mark) and adds mode semantics: the active streams stay saturated, the
 * inactive stream pales to barely-visible, and the thick white combined beam
 * lights only in unified mode.
 *
 * Discriminants:
 *  - "audioOnly playback dims the video stream even in unified mode" fails if
 *    the audioOnly prop wiring is dropped (D-spec: clicking audio-only turns
 *    the orange stream pale regardless of the toggle's own mode).
 *  - "straight beam segments" fails if the geometry regresses to curved paths.
 *  - "combined beam lights only in unified" fails if the white beam's opacity
 *    mapping is removed.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PrismConvergeToggle } from '../components/player/PrismConvergeToggle';

afterEach(cleanup);

const PALE = '0.18'; // faint trace (owner 2026-10-19: "even more subdued")
const DIM = '0.25'; // combined beam when not in unified mode

function renderToggle(mode: 'unified' | 'audio' | 'video', audioOnly = false) {
  return render(<PrismConvergeToggle mode={mode} onModeChange={() => {}} audioOnly={audioOnly} />);
}

describe('PrismConvergeToggle', () => {
  it.each(['unified', 'audio', 'video'] as const)(
    'exposes a 3-option format radiogroup in %s mode',
    (mode) => {
      renderToggle(mode);
      expect(screen.getByRole('radiogroup', { name: 'Playback format' })).not.toBeNull();
      expect(screen.getAllByRole('radio')).toHaveLength(3);
    }
  );

  it('unified mode: both streams and the combined beam fully lit', () => {
    const { getByTestId } = renderToggle('unified');
    expect(getByTestId('mark-audio-beam').getAttribute('opacity')).toBe('1');
    expect(getByTestId('mark-video-beam').getAttribute('opacity')).toBe('1');
    expect(getByTestId('mark-combined').getAttribute('opacity')).toBe('1');
  });

  it('audio mode: video stream pales, audio stays saturated', () => {
    const { getByTestId } = renderToggle('audio');
    expect(getByTestId('mark-video-beam').getAttribute('opacity')).toBe(PALE);
    expect(getByTestId('mark-audio-beam').getAttribute('opacity')).toBe('1');
  });

  it('video mode: audio stream pales, video stays saturated', () => {
    const { getByTestId } = renderToggle('video');
    expect(getByTestId('mark-audio-beam').getAttribute('opacity')).toBe(PALE);
    expect(getByTestId('mark-video-beam').getAttribute('opacity')).toBe('1');
  });

  it('audioOnly playback dims the video stream even in unified mode', () => {
    const { getByTestId } = renderToggle('unified', true);
    const video = getByTestId('mark-video-beam');
    expect(video.getAttribute('opacity')).toBe(PALE);
    expect(video.style.filter).toContain('saturate'); // desaturated, not just dimmed
    expect(getByTestId('mark-audio-beam').getAttribute('opacity')).toBe('1');
  });

  it('combined (white) beam lights only in unified mode', () => {
    const { getByTestId } = renderToggle('audio');
    expect(getByTestId('mark-combined').getAttribute('opacity')).toBe(DIM);
  });

  it('uses straight beam segments (no curve commands)', () => {
    const { getByTestId } = renderToggle('unified');
    for (const id of ['mark-audio-beam', 'mark-video-beam']) {
      const d = getByTestId(id).getAttribute('d') ?? '';
      expect(d).toMatch(/^[ML\s0-9.-]+$/); // only M/L commands + coordinates
    }
  });

  // Owner 2026-10-19: the beams continue to infinity, so the old end dots
  // (mode indicators) are gone. Fails if any indicator circle comes back.
  it('draws no end dots on the beams', () => {
    const { container } = renderToggle('audio');
    expect(container.querySelectorAll('.mode-indicator')).toHaveLength(0);
  });
});
