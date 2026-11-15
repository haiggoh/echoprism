/**
 * Task 11 reducer: nextAudioOnly — metered auto-switch, restore semantics,
 * user override, ask-prompt, setting off.
 */
import { describe, it, expect } from 'vitest';
import { nextAudioOnly } from '../lib/audioOnlyAuto';
import type { AudioOnlyState } from '../lib/audioOnlyAuto';

const on = (over: Partial<AudioOnlyState> = {}): AudioOnlyState => ({
  on: false,
  origin: 'user',
  userChoiceBeforeAuto: null,
  ...over,
});
const prefs = { audio_only_on_metered: true, metered_restore: 'restore' as const };

describe('nextAudioOnly', () => {
  it('metered → on, origin auto, remembers prior', () => {
    const r = nextAudioOnly(on(), { kind: 'metered' }, prefs);
    expect(r.state).toEqual({ on: true, origin: 'auto', userChoiceBeforeAuto: false });
    expect(r.prompt).toBe(false);
  });

  it('metered with the setting off → ignored', () => {
    const s = on();
    const r = nextAudioOnly(s, { kind: 'metered' }, { ...prefs, audio_only_on_metered: false });
    expect(r.state).toBe(s);
  });

  it('metered while already user-on → unchanged (user keeps it on)', () => {
    const s = on({ on: true, origin: 'user' });
    const r = nextAudioOnly(s, { kind: 'metered' }, prefs);
    expect(r.state).toBe(s);
  });

  it('unmetered + restore → back to prior (off), origin user', () => {
    const auto = nextAudioOnly(on(), { kind: 'metered' }, prefs).state;
    const r = nextAudioOnly(auto, { kind: 'unmetered' }, prefs);
    expect(r.state).toEqual({ on: false, origin: 'user', userChoiceBeforeAuto: null });
    expect(r.prompt).toBe(false);
  });

  it('unmetered + ask → prompt, no change', () => {
    const auto = nextAudioOnly(on(), { kind: 'metered' }, prefs).state;
    const r = nextAudioOnly(auto, { kind: 'unmetered' }, { ...prefs, metered_restore: 'ask' });
    expect(r.state).toBe(auto);
    expect(r.prompt).toBe(true);
  });

  it('user toggles while auto → origin user; unmetered leaves it', () => {
    const auto = nextAudioOnly(on(), { kind: 'metered' }, prefs).state;
    const toggled = nextAudioOnly(auto, { kind: 'user-toggle', on: false }, prefs).state;
    expect(toggled.origin).toBe('user');
    expect(toggled.on).toBe(false);
    const after = nextAudioOnly(toggled, { kind: 'unmetered' }, prefs);
    expect(after.state).toBe(toggled); // unmetered does not override the user
  });

  it('unmetered when origin is user → no change, no prompt', () => {
    const s = on({ on: true, origin: 'user' });
    const r = nextAudioOnly(s, { kind: 'unmetered' }, prefs);
    expect(r.state).toBe(s);
    expect(r.prompt).toBe(false);
  });

  it('restore returns to a remembered ON state (user had it on)', () => {
    // ucb=true with origin auto: the user had audio-only on before the rule
    // engaged — restore must leave it ON.
    const s = on({ on: true, origin: 'auto', userChoiceBeforeAuto: true });
    const r = nextAudioOnly(s, { kind: 'unmetered' }, prefs);
    expect(r.state.on).toBe(true);
    expect(r.state.origin).toBe('user');
  });
});
