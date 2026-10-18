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

const PALE = '0.35'; // "very pale … barely visible" (desaturated, not just dim)
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
    expect(getByTestId('toggle-audio-beam').getAttribute('opacity')).toBe('1');
    expect(getByTestId('toggle-video-beam').getAttribute('opacity')).toBe('1');
    expect(getByTestId('toggle-combined-beam').getAttribute('opacity')).toBe('1');
  });

  it('audio mode: video stream pales, audio stays saturated', () => {
    const { getByTestId } = renderToggle('audio');
    expect(getByTestId('toggle-video-beam').getAttribute('opacity')).toBe(PALE);
    expect(getByTestId('toggle-audio-beam').getAttribute('opacity')).toBe('1');
  });

  it('video mode: audio stream pales, video stays saturated', () => {
    const { getByTestId } = renderToggle('video');
    expect(getByTestId('toggle-audio-beam').getAttribute('opacity')).toBe(PALE);
    expect(getByTestId('toggle-video-beam').getAttribute('opacity')).toBe('1');
  });

  it('audioOnly playback dims the video stream even in unified mode', () => {
    const { getByTestId } = renderToggle('unified', true);
    const video = getByTestId('toggle-video-beam');
    expect(video.getAttribute('opacity')).toBe(PALE);
    expect(video.style.filter).toContain('saturate'); // desaturated, not just dimmed
    expect(getByTestId('toggle-audio-beam').getAttribute('opacity')).toBe('1');
  });

  it('combined (white) beam lights only in unified mode', () => {
    const { getByTestId } = renderToggle('audio');
    expect(getByTestId('toggle-combined-beam').getAttribute('opacity')).toBe(DIM);
  });

  it('uses straight beam segments (no curve commands)', () => {
    const { getByTestId } = renderToggle('unified');
    for (const id of ['toggle-audio-beam', 'toggle-video-beam']) {
      const d = getByTestId(id).getAttribute('d') ?? '';
      expect(d).toMatch(/^[ML\s0-9.-]+$/); // only M/L commands + coordinates
    }
  });
});
