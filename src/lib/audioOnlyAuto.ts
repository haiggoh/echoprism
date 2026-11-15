/**
 * Task 11: opt-in audio-only on metered (expensive/constrained) networks.
 * Pure reducer — the engine must remember whether the current audio-only
 * state was set by the USER or by this rule, so a return to a normal network
 * can restore the user's own choice.
 */

export type AudioOnlyOrigin = 'user' | 'auto';

export interface AudioOnlyState {
  on: boolean;
  origin: AudioOnlyOrigin;
  /** The effective on-state before the auto-switch (for restore). */
  userChoiceBeforeAuto: boolean | null;
}

export type AudioOnlyEvent =
  | { kind: 'metered' }
  | { kind: 'unmetered' }
  | { kind: 'user-toggle'; on: boolean };

export interface AudioOnlyPrefs {
  audio_only_on_metered: boolean;
  metered_restore: 'restore' | 'ask';
}

export function nextAudioOnly(
  state: AudioOnlyState,
  event: AudioOnlyEvent,
  prefs: AudioOnlyPrefs,
): { state: AudioOnlyState; prompt: boolean } {
  switch (event.kind) {
    case 'metered': {
      if (!prefs.audio_only_on_metered) return { state, prompt: false };
      if (state.on) return { state, prompt: false }; // already on (user or auto)
      return {
        state: { on: true, origin: 'auto', userChoiceBeforeAuto: state.on },
        prompt: false,
      };
    }
    case 'unmetered': {
      if (state.origin !== 'auto') return { state, prompt: false }; // not ours to undo
      if (prefs.metered_restore === 'ask') return { state, prompt: true };
      const back = state.userChoiceBeforeAuto ?? false;
      return {
        state: { on: back, origin: 'user', userChoiceBeforeAuto: null },
        prompt: false,
      };
    }
    case 'user-toggle': {
      // A user toggle while auto overrides the rule; a later unmetered
      // event leaves the user's choice alone (origin is now 'user').
      return {
        state: { on: event.on, origin: 'user', userChoiceBeforeAuto: state.userChoiceBeforeAuto },
        prompt: false,
      };
    }
  }
}
