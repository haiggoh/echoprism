import { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePlayerStore } from '../store/slices/playerSlice';
import { useQueueStore } from '../store/slices/queueSlice';
import { episodeCommands, historyCommands, settingsCommands } from '../hooks/useTauriCommands';
// Namespace import for the match-on-play call: several engine tests partially
// mock useTauriCommands WITHOUT smartLinkCommands — the optional chain keeps
// those green while the real app always has the export.
import * as tauriCommands from '../hooks/useTauriCommands';
import { resolveDefaultPlayMode } from '../lib/playModeChain';
import { useMediaSession } from '../hooks/useMediaSession';
import { useMenuPlayback } from '../hooks/useMenuPlayback';
import { readStoredPlaybackRate, writeStoredPlaybackRate } from './player/SpeedControl';
import { useToasts } from './ui/Toaster';
import { Channel, Episode, PlayMode, PlayModeRule } from '../types';

interface PlayerContextType {
  currentEpisode: Episode | null;
  isPlaying: boolean;
  /** What the CURRENT playback resolves through ('video' | 'audio'): the D7
   *  chain mode or the toggle at play time. Distinct from isAudioMode, the
   *  user's standing preference — a per-play override must not rewrite it. */
  playbackFormat: 'video' | 'audio';
  isAudioMode: boolean;
  isPip: boolean;
  /** True when a video element is registered and the platform offers PiP. */
  canPip: boolean;
  volume: number;
  playbackRate: number;
  progress: number;
  currentTime: number;
  duration: number;
  play: (episode: Episode, mode?: PlayMode) => void;
  /** Load an episode into the engine WITHOUT playback (D2 'load_paused'):
   *  it becomes the current episode at its saved position; pressing play
   *  resolves and starts the stream. opts.mode carries the D7 chain output so
   *  the later toggle-play resolves the rule's format, not the toggle's. */
  load: (episode: Episode, opts?: { paused?: boolean; mode?: PlayMode }) => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (position: number) => void;
  setVolume: (volume: number) => void;
  /** Mute/unmute. Unmute restores the level the mute was taken from. */
  toggleMute: () => void;
  setPlaybackRate: (rate: number) => void;
  setAudioMode: (mode: boolean) => void;
  togglePip: () => void;
  nextTrack: () => void;
  previousTrack: () => void;
  /** Seek to 0 on the loaded item and keep playing. Its own action, so
   *  previous() can always mean "the previous item" (owner 2026-10-27). */
  restart: () => void;
  /** False at the queue's ends — the buttons disable rather than no-op. */
  hasNext: boolean;
  hasPrevious: boolean;
  /** Smart-link one-tap switch (features.csv must-have; fixes_combined §6):
   *  play the current episode's cross-stream twin at the same RELATIVE
   *  position. No-op when the episode has no linked twin. */
  switchToLinked: () => Promise<void>;
  /** PlayerScreen registers its <video> element here; the engine picks the active media element. */
  registerVideoElement: (el: HTMLVideoElement | null) => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerProvider({ children }: { children: ReactNode }) {
  // Zustand actions are stable references, so destructuring them keeps the
  // callbacks below dependency-stable.
  const {
    isPlaying,
    isAudioMode,
    isPip,
    volume,
    playbackRate,
    playbackState,
    setPlaying,
    setPlaybackState,
    setAudioMode: setStoreAudioMode,
    setPip,
    setVolume,
    toggleMute,
    setPlaybackRate: setStorePlaybackRate,
  } = usePlayerStore();
  const { items, currentIndex, repeatMode, setCurrentIndex, nextTrack: queueNext, previousTrack: queuePrev } = useQueueStore();
  const { addToast } = useToasts();
  // D7 (Phase 5): the engine resolves the play-mode chain on QUEUE ADVANCE too,
  // not just on the card-click path in useEpisodePlay. It READS the shared
  // react-query cache rather than subscribing, because three existing test
  // files render PlayerProvider without a QueryClientProvider ancestor and the
  // media engine has no business requiring one; useEpisodePlay still owns the
  // actual fetch under the same keys, so no second round-trip is created.
  const queryClient = useQueryClient();

  const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  // What the CURRENT playback resolves through — per-play (D7 chain mode or
  // the toggle at play time). Kept separate from isAudioMode, the user's
  // standing preference: an override writes this, never the toggle (plan:
  // "override affects initial choice only; audio-only toggle still governs
  // subsequent switches").
  const [playbackFormat, setPlaybackFormat] = useState<'video' | 'audio'>('video');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentEpisodeRef = useRef<Episode | null>(null);
  const isAudioModeRef = useRef(isAudioMode);
  isAudioModeRef.current = isAudioMode;
  // The SYNCHRONOUS authority for the current playback format: play()/load()
  // write it at call time via applyPlaybackFormat, because the resolve effect
  // is triggered by the zustand store (isPlaying) and would otherwise race a
  // format that only exists as pending useState state. Deliberately NOT
  // render-synced (`ref.current = playbackFormat` in the body): React can
  // commit the zustand-driven render before the useState update lands, and
  // that render would clobber the fresh ref with the stale state value.
  // The ref is written ONLY by applyPlaybackFormat (paired with the state).
  const playbackFormatRef = useRef<'video' | 'audio'>('video');

  const applyPlaybackFormat = (format: 'video' | 'audio') => {
    playbackFormatRef.current = format;
    setPlaybackFormat(format);
  };

  // Playback speed is a STANDING preference, not per-playback state: the owner
  // picks 1.5x once and expects it to hold, which means it must outlive the
  // session. (Live-test Task 7: the rate existed but nothing persisted it, so
  // the choice died with every launch.) Best-effort by design — a storage
  // failure must not break the rate change itself.
  const setPlaybackRate = useCallback(
    (rate: number) => {
      setStorePlaybackRate(rate);
      writeStoredPlaybackRate(rate);
    },
    [setStorePlaybackRate],
  );

  // Restore the persisted rate once, on mount. A ref guards it so a re-mount
  // inside the same session (a test re-render, a StrictMode double-invoke)
  // does not overwrite a rate the user changed after launch. An absent or
  // unusable stored value leaves the store default alone.
  const rateHydrated = useRef(false);
  useEffect(() => {
    if (rateHydrated.current) return;
    rateHydrated.current = true;
    const stored = readStoredPlaybackRate();
    if (stored !== null) setStorePlaybackRate(stored);
  }, [setStorePlaybackRate]);

  // Mirrored for the src-change path below, which is not keyed on the rate.
  const playbackRateRef = useRef(playbackRate);
  playbackRateRef.current = playbackRate;
  // play() re-created each render; auto-advance reads it through a ref to avoid effect loops.
  const playRef = useRef<(ep: Episode, mode?: PlayMode) => void>(() => {});
  // Same for load(): the queue-cursor effect follows the cursor while paused
  // through this (live-test Task 8), and must not re-run on every load change.
  const loadRef = useRef<(ep: Episode, opts?: { paused?: boolean; mode?: PlayMode }) => void>(() => {});

  // The per-play format: an explicit D7 chain mode wins; otherwise the user's
  // standing toggle decides. 'unified' — the queue's no-preference value —
  // defers to the toggle exactly like an absent mode.
  const formatFor = (mode?: PlayMode): 'video' | 'audio' =>
    mode === 'audio' ? 'audio' : mode === 'video' ? 'video' : isAudioModeRef.current ? 'audio' : 'video';

  const hasVideo = !!currentEpisode && (!!currentEpisode.video_id || !!currentEpisode.video_url);
  // The engine plays through exactly one element: video when the current
  // playback resolves through the video format and the episode has it, the
  // hidden audio element otherwise.
  const activeEl: HTMLMediaElement | null =
    playbackFormat === 'video' && hasVideo && videoEl ? videoEl : audioRef.current;

  const registerVideoElement = useCallback((el: HTMLVideoElement | null) => {
    setVideoEl(el);
  }, []);

  const play = useCallback(
    (ep: Episode, mode?: PlayMode) => {
      currentEpisodeRef.current = ep;
      setCurrentEpisode(ep);
      // Live-test Task 8: playing an episode that is ALREADY a queue item must
      // move the queue cursor onto it. Without this the player and the queue
      // disagreed about position — the owner's "the queue isn't working
      // correctly" — because Next/Previous navigate relative to
      // currentIndex, so skipping from a feed-clicked episode moved the WRONG
      // item. An episode that is not in the queue leaves the cursor alone:
      // there is nothing truthful to point it at.
      const queuedAt = items.findIndex((it) => it.episode?.id === ep.id);
      if (queuedAt >= 0 && queuedAt !== currentIndex) setCurrentIndex(queuedAt);
      // Sets the playback format only — NEVER the user's audio toggle, which
      // would leak the override into every later override-less play.
      applyPlaybackFormat(formatFor(mode));
      setPlaying(true); // the resolve effect starts playback once the src is set
      setPlaybackState({
        episode_id: ep.id,
        position_seconds: ep.progress_seconds ?? 0,
        duration_seconds: ep.duration_seconds,
      });
      // Changing episode invalidates any previous stream; resolution is owned
      // by the resolve effect below (single code path, also serves load(paused)).
      setStreamUrl(null);
      setResolveTick((t) => t + 1);
    },
    [setPlaying, setPlaybackState, items, currentIndex, setCurrentIndex]
  );
  playRef.current = play;

  const load = useCallback(
    (ep: Episode, opts?: { paused?: boolean; mode?: PlayMode }) => {
      currentEpisodeRef.current = ep;
      setCurrentEpisode(ep);
      // The D7 chain mode travels with a load_paused click, so the later
      // toggle-play resolves the rule's format rather than the toggle's.
      applyPlaybackFormat(formatFor(opts?.mode));
      setPlaying(false);
      setPlaybackState({
        episode_id: ep.id,
        position_seconds: ep.progress_seconds ?? 0,
        duration_seconds: ep.duration_seconds,
      });
      setStreamUrl(null);
      setResolveTick((t) => t + 1);
    },
    [setPlaying, setPlaybackState]
  );
  // Read by the queue-cursor effect below (a paused skip must still follow it).
  loadRef.current = load;

  // The user's audio toggle: writes the standing preference AND switches the
  // current playback over. Distinct from the D7 chain's per-play mode, which
  // flows through play()/load() into playbackFormat without touching this.
  // Parity audit batch 3 (owner decision 2026-11-02): Audio only is
  // REMEMBERED. The stored value is read once at mount; a toggle the user makes
  // before that read lands wins (the late read must not overwrite it).
  const audioModeTouched = useRef(false);
  useEffect(() => {
    let cancelled = false;
    settingsCommands
      .get()
      .then((prefs) => {
        if (cancelled || audioModeTouched.current || !prefs) return;
        if (prefs.audio_only_default) {
          setStoreAudioMode(true);
          applyPlaybackFormat('audio');
        }
      })
      .catch((err) => console.warn('preferences: reading audio-only failed', err));
    return () => {
      cancelled = true;
    };
  }, [setStoreAudioMode]);

  const setAudioMode = useCallback(
    (mode: boolean) => {
      audioModeTouched.current = true;
      setStoreAudioMode(mode);
      // Remember it (best-effort: a failed write must not block the switch).
      settingsCommands
        .update({ audio_only_default: mode })
        .then(() => queryClient.invalidateQueries({ queryKey: ['preferences'] }))
        .catch((err) => console.warn('preferences: saving audio-only failed', err));
      applyPlaybackFormat(mode ? 'audio' : 'video');
      // Live-test batch 2 Task 3: dropping the CURRENT stream is the whole fix.
      // Without it the resolve effect bails on `streamUrl` already being set,
      // so toggling mid-playback switched the active element to the hidden
      // <audio> — which has no src — while the video stream kept running
      // invisibly. The toggle looked inert, which is what the owner reported.
      // Clearing it makes the effect resolve again for the new format.
      // Playback position is NOT reset here: the effect restores it from the
      // store on the new src (the F06 format-switch sync).
      setStreamUrl(null);
      setResolveTick((t) => t + 1);
    },
    [setStoreAudioMode, setStreamUrl, queryClient]
  );

  // Resolve the stream for the current episode once playback is requested.
  // Single resolution path: play() and load(paused) only set state; this effect
  // turns (isPlaying, current episode, no stream yet) into a stream_episode
  // call. A stale resolution (episode switched mid-flight) is discarded.
  const resolvingRef = useRef(false);
  // Round 5: a bumped tick re-triggers resolution — covers the toggle-during-
  // in-flight-resolve case where the effect bailed on resolvingRef and nothing
  // else changed to re-run it (stream stuck with no src).
  const [resolveTick, setResolveTick] = useState(0);
  // Owner 2026-11-04 round 4: run smart-link matching when playback starts, so
  // the switch-to-twin button appears whenever a match exists — debounced to
  // at most one run per 30 s; matching must never break playback.
  const lastMatchAtRef = useRef(0);
  useEffect(() => {
    if (!isPlaying || streamUrl || resolvingRef.current) return;
    const ep = currentEpisodeRef.current;
    if (!ep) return;
    resolvingRef.current = true;
    const now = Date.now();
    if (now - lastMatchAtRef.current > 30_000) {
      lastMatchAtRef.current = now;
      const matchPromise = tauriCommands.smartLinkCommands?.match?.() ?? Promise.resolve({ matched_count: 0 });
      matchPromise
        .then(() =>
          queryClient.invalidateQueries({
            predicate: (q) =>
              ['smart-links', 'feed', 'channels', 'search', 'episode', 'history'].includes(
                q.queryKey[0] as string,
              ),
          }),
        )
        .catch((err: unknown) => console.warn('smart-link match on play failed', err));
    }
    // A podcast episode has no video capability: requesting format 'video'
    // fails at the backend and the catch path kills playback. Start from the
    // playback format play()/load() chose (D7 chain mode or the toggle), then
    // apply the episode's own capability as a floor.
    const wantAudio = playbackFormatRef.current === 'audio' || (!ep.video_id && !ep.video_url);
    // Round 5: the toggle state at resolve start — a mid-flight toggle discards
    // the stale result. (Compare the TOGGLE only: the capability floor above
    // can make wantAudio true while the toggle is off — that is not a change.)
    const audioAtStart = playbackFormatRef.current === 'audio';
    episodeCommands
      .stream(ep.id, wantAudio ? 'audio' : 'video')
      .then((info) => {
        if ((playbackFormatRef.current === 'audio') !== audioAtStart) {
          // The audio-only toggle changed while resolving — discard the
          // stale-format result and re-resolve for the new format.
          setResolveTick((t) => t + 1);
          return;
        }
        // Only commit if this episode is still the one the engine is playing.
        if (currentEpisodeRef.current?.id === ep.id) {
          setStreamUrl(info.url);
          // Live-test finding: history had no writer. One row per actual
          // playback start — here, where the resolve SUCCEEDED (media that
          // fails to resolve never played, so it never enters history).
          // Live-test 2026-10-27: recording worked but the History screen
          // kept its cached list (5-minute staleTime) — tell the cache.
          // A failure is logged, never thrown: history must not break playback.
          historyCommands
            .record(ep.id)
            .then(() => queryClient.invalidateQueries({ queryKey: ['history'] }))
            .catch((err) => console.warn('history: recording a play failed', err));
        }
      })
      .catch(() => {
        if (currentEpisodeRef.current?.id !== ep.id) return;
        setPlaying(false);
        setStreamUrl(null);
        addToast({
          title: 'Playback unavailable',
          description:
            'Could not resolve a stream for this episode. Add a healthy Invidious/Piped instance in Settings first.',
          variant: 'danger',
        });
      })
      .finally(() => {
        resolvingRef.current = false;
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- queryClient is a stable provider singleton; adding it would re-run stream resolution on every render
  }, [isPlaying, streamUrl, resolveTick, setPlaying, addToast]);

  const pause = useCallback(() => setPlaying(false), [setPlaying]);

  const togglePlay = useCallback(() => setPlaying(!isPlaying), [isPlaying, setPlaying]);

  // Batch 4 item 6: a seek can make a media element fire `error` while the
  // server catches up to the requested position (seen on long podcasts whose
  // CDN is slow to range). That must NOT kill playback — tracked via this ref.
  const seekingRef = useRef(false);
  // Round 9 recovery: the position the user sought, kept in a REF because the
  // error handler's closure can be a render old (a store read there restored
  // 0 in the jsdom test) — refs are immune to that staleness.
  const soughtRef = useRef<number | null>(null);
  // Round 6 Task 1 (echoprism-audio-switch-position): a `currentTime` written
  // before `loadedmetadata` is reset by the media load algorithm (WebKit), so
  // the position restore at src-change is ALSO held here and re-applied on
  // `loadedmetadata`; `timeupdate` is ignored while it is pending (cleared on
  // `seeked`), so the fresh element's first timeupdate (0) cannot clobber the
  // stored position.
  const pendingRestoreRef = useRef<number | null>(null);
  const seek = useCallback(
    (position: number) => {
      setPlaybackState({ position_seconds: position });
      const el = playbackFormatRef.current === 'video' && videoEl ? videoEl : audioRef.current;
      // Round 6 final review: a seek made while a src-change restore is still
      // pending (the new element has not loaded metadata yet) must WIN — the
      // loadedmetadata re-apply would otherwise yank playback back to the old
      // position, discarding the user's drag.
      if (pendingRestoreRef.current !== null) pendingRestoreRef.current = position;
      // Only arm the guard when there is an element to seek — a null element
      // must not leave the flag sticky (review 2026-11-03).
      if (el) {
        seekingRef.current = true;
        soughtRef.current = position;
        el.currentTime = position;
      }
    },
    [setPlaybackState, videoEl]
  );

  // Parity audit batch 3 (A6): PiP was a flag nothing consumed. It now asks the
  // registered <video> for real Picture-in-Picture, and the flag FOLLOWS the
  // element's own enter/leave events (so the system's close button is honoured).
  const canPip =
    !!videoEl &&
    typeof document !== 'undefined' &&
    (document as Document & { pictureInPictureEnabled?: boolean }).pictureInPictureEnabled === true &&
    typeof (videoEl as HTMLVideoElement & { requestPictureInPicture?: unknown }).requestPictureInPicture === 'function';
  const togglePip = useCallback(() => {
    if (!videoEl) return;
    const doc = document as Document & { pictureInPictureElement?: Element | null; exitPictureInPicture?: () => Promise<void> };
    const request = doc.pictureInPictureElement === videoEl
      ? doc.exitPictureInPicture?.()
      : videoEl.requestPictureInPicture?.();
    void request?.catch((err: unknown) => console.warn('picture-in-picture failed', err));
  }, [videoEl]);
  useEffect(() => {
    if (!videoEl) return;
    const enter = () => setPip(true);
    const leave = () => setPip(false);
    videoEl.addEventListener('enterpictureinpicture', enter);
    videoEl.addEventListener('leavepictureinpicture', leave);
    return () => {
      videoEl.removeEventListener('enterpictureinpicture', enter);
      videoEl.removeEventListener('leavepictureinpicture', leave);
    };
  }, [videoEl, setPip]);

  const nextTrack = useCallback(() => queueNext(), [queueNext]);
  const previousTrack = useCallback(() => queuePrev(), [queuePrev]);

  // Pause whichever element is not active, then bring the active element in
  // sync with (src, isPlaying). Position is restored from the store on src
  // change — that is the format-switch position sync (F06).
  useEffect(() => {
    const inactive = activeEl === audioRef.current ? videoEl : audioRef.current;
    if (inactive && !inactive.paused) inactive.pause();

    if (!activeEl || !streamUrl) return;
    // Compare the CONTENT ATTRIBUTE, not the .src IDL property: real browsers
    // resolve the property to an absolute URL, so a relative streamUrl would
    // never compare equal and every playbackState update (each timeupdate!)
    // would re-assign src and restart the load (observed in e2e: readyState
    // pinned at 0, networkState NETWORK_NO_SOURCE despite 206 responses;
    // jsdom reflects the raw attribute, which is why unit tests missed it).
    if (activeEl.getAttribute('src') !== streamUrl) {
      activeEl.src = streamUrl;
      const restore = playbackState?.position_seconds ?? 0;
      // Held for loadedmetadata: the eager write below only survives where the
      // browser honours a pre-metadata currentTime.
      pendingRestoreRef.current = restore;
      activeEl.currentTime = restore;
      // The HTML media spec RESETS playbackRate to 1 whenever a new src is
      // loaded, and the element NODE is reused for every episode, so the
      // [playbackRate, videoEl] effect below never sees the change — leaving
      // every new episode silently playing at 1x after the owner chose 1.5x.
      // Re-apply here, where the src actually changes. Read from a ref so this
      // effect does not need to re-run (and re-enter its play() branch) on
      // every rate change.
      activeEl.playbackRate = playbackRateRef.current;
    }
    if (isPlaying) {
      void activeEl.play().catch((err: unknown) => {
        // An AbortError here is our own pause() interrupting this element's
        // pending play() — the element-switch branch above (or a user pause)
        // racing the promise. That is not a playback failure and must not
        // stop the engine. Observed in e2e: the audio->video element switch
        // rejected the audio's play(), this catch killed global playback,
        // and the video then stayed paused with a valid src.
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setPlaying(false);
      });
    } else if (!activeEl.paused) {
      activeEl.pause();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- videoEl is read through activeEl/playbackFormatRef; re-running when the element registers would restart playback
  }, [activeEl, streamUrl, isPlaying, playbackState, setPlaying]);

  // Media element -> store: time, duration, and queue advance on end.
  useEffect(() => {
    const el = activeEl;
    if (!el) return;
    const onTime = () => {
      // Round 6 Task 1: while a position restore is pending, the fresh
      // element's timeupdate (0) must not overwrite the stored position.
      if (pendingRestoreRef.current !== null) return;
      setPlaybackState({ position_seconds: el.currentTime });
    };
    const onMeta = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) {
        setPlaybackState({ duration_seconds: el.duration });
      }
      // Round 6 Task 1: re-apply the restore now that the write survives.
      if (pendingRestoreRef.current !== null) {
        el.currentTime = pendingRestoreRef.current;
      }
    };
    // Repeat 'one' loops on the NATURAL end only (a manual Next still skips),
    // so it lives here rather than in the slice's nextTrack. Restarting the
    // same element in place: the slice writes no state for 'one', so nothing
    // downstream would re-trigger playback, and the stream is already loaded.
    const onEnded = () => {
      if (useQueueStore.getState().repeatMode === 'one') {
        el.currentTime = 0;
        el.play().catch(() => setPlaying(false));
        return;
      }
      queueNext();
    };
    const onError = () => {
      // Round 6 Task 1: a failed load fires error WITHOUT seeked — clear the
      // pending restore here too, so onTime can never be frozen by a ref that
      // no seeked will ever clear.
      pendingRestoreRef.current = null;
      // Batch 4 item 6: an error right after a seek is the server catching up
      // to the requested position — downgrade to a warning, keep playing.
      if (seekingRef.current) {
        // Clear on the error path too: a FAILED seek fires error WITHOUT
        // seeked, and the flag must not downgrade every later genuine error
        // (review 2026-11-03).
        seekingRef.current = false;
        // Round 9 instrument (echoprism-audio-only-large): the swallowed error
        // was invisible — log the same detail the non-seek path logs, so a
        // stall is diagnosable from the log alone (which layer 403'd, and on
        // which streamUrl).
        console.warn('seek-suppressed media error, streamUrl =', streamUrl);
        console.warn(
          `seek-suppressed error detail: tag=${el.tagName} code=${el.error?.code} msg=${JSON.stringify(el.error?.message ?? '')} networkState=${el.networkState} readyState=${el.readyState} currentSrc=${el.currentSrc}`,
        );
        addToast({
          title: 'Recovering playback…',
          description: 'The stream dropped on that jump — re-resolving from your position.',
          variant: 'warning',
        });
        // Round 9 recovery: an element that fired `error` NEVER recovers by
        // itself — returning here stranded playback behind the toast (the
        // owner's "takes minutes or never"; small jumps stayed inside the
        // buffer and never hit the failed request, which is why only large
        // seeks stalled). Re-run the proven toggle machinery: hold the sought
        // position for the loadedmetadata restore and clear the stream so the
        // single resolve effect re-resolves the current episode/format fresh.
        pendingRestoreRef.current = soughtRef.current;
        setStreamUrl(null);
        return;
      }
      setPlaying(false);
      console.warn('media element error, streamUrl =', streamUrl);
      // Which layer failed (round 6 diagnosis: code 4 = an image was served).
      // code: 1 aborted, 2 network, 3 decode, 4 src not supported.
      console.warn(
        `media element error detail: tag=${el.tagName} code=${el.error?.code} msg=${JSON.stringify(el.error?.message ?? '')} networkState=${el.networkState} readyState=${el.readyState} currentSrc=${el.currentSrc}`,
      );
      addToast({
        title: 'Stream error',
        description: 'The media element failed to load this stream. The instance may be unhealthy — try another one.',
        variant: 'danger',
      });
    };
    const onSeeked = () => {
      seekingRef.current = false;
      pendingRestoreRef.current = null;
    };
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('seeked', onSeeked);
    el.addEventListener('ended', onEnded);
    el.addEventListener('error', onError);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('seeked', onSeeked);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('error', onError);
    };
  }, [activeEl, streamUrl, setPlaybackState, queueNext, addToast, setPlaying]);

  // Keep both elements' volume/rate in sync so a format switch is seamless.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    if (videoEl) videoEl.volume = volume;
  }, [volume, videoEl]);
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
    if (videoEl) videoEl.playbackRate = playbackRate;
  }, [playbackRate, videoEl]);

  // Auto-advance: when the queue's current ITEM changes while playing,
  // continue with it (queue items queued from the feed carry their episode).
  // Keyed on queue-item IDENTITY (its id), not the index number nor the
  // episode: removing the playing item (F05-N1) leaves currentIndex unchanged
  // but shifts a new item into it; reordering moves the playing item to a new
  // index without changing it (must NOT restart, review #6); and the same
  // episode queued twice is two items, so advancing between them still plays.
  // Item ids survive setPlayMode/position rewrites, so unrelated edits are
  // ignored too.
  const lastItemIdRef = useRef<string | undefined>(items[currentIndex]?.id);
  useEffect(() => {
    const item = items[currentIndex];
    if (item?.id === lastItemIdRef.current) return;
    lastItemIdRef.current = item?.id;
    const ep = item?.episode;
    if (!ep) {
      if (isPlaying) setPlaying(false);
      return;
    }
    // Phase 5: resolve the D7 chain HERE, at play time, so a rule the owner
    // set for this title family applies to the queue too — and a rule edited
    // AFTER this item was queued still takes effect (owner decision
    // 2026-10-25: lazy resolution, not a mode stamped at queue time).
    // A cache miss resolves to [] — no override — exactly like having no
    // rules. undefined falls through to the engine default as before.
    const rules = (queryClient.getQueryData<PlayModeRule[]>(['play-mode-rules']) ??
      []) as PlayModeRule[];
    const channels = (queryClient.getQueryData<Channel[]>(['channels', 'for-play-mode']) ??
      []) as Channel[];
    const mode: PlayMode | undefined = resolveDefaultPlayMode(ep, rules, channels);
    // Live-test Task 8: the queue cursor must be followed in BOTH states. This
    // was gated on `isPlaying` alone, so a Next/Previous pressed while PAUSED
    // moved the cursor and left the player on the OLD episode — the owner's
    // "the queue isn't working correctly yet". `currentEpisode` is state, so
    // the `?? items[currentIndex]?.episode` fallback in the context value can
    // only apply while it is still null; once set, nothing else updated it.
    // Paused stays paused on the new item (a load, no stream resolve — the
    // resolve happens when the user presses play); playing keeps playing.
    if (isPlaying) playRef.current(ep, mode);
    else loadRef.current(ep, { mode });
  }, [currentIndex, items, isPlaying, setPlaying, queryClient]);

  const position = playbackState?.position_seconds ?? 0;
  const duration = playbackState?.duration_seconds ?? 0;

  // Live-test 2026-10-28: the seek path bails on `duration <= 0`, so an episode
  // with no known length has a DEAD timeline — every click a silent no-op, which
  // is why no gate noticed. Podcasts hit this wholesale: parse_rss ignored
  // <itunes:duration> until now, and all 1,103 of the owner's stored podcast rows
  // still carry duration_seconds NULL. The media element knows its own length as
  // soon as metadata loads, so adopt it rather than leave the timeline inert.
  // Only fills a GAP — a known duration is never second-guessed.
  const setDurationSafe = usePlayerStore((s) => s.setDuration);
  useEffect(() => {
    if (duration > 0 || !activeEl) return;
    // Adopt the element's length whenever it BECOMES known, not only at render
    // time: a streaming podcast's metadata can land after the last render, and
    // sampling once per render would leave the timeline dead (live-test 2026-10-31).
    const adopt = () => {
      const d = activeEl.duration;
      if (Number.isFinite(d) && d > 0) setDurationSafe(d);
    };
    adopt();
    activeEl.addEventListener('durationchange', adopt);
    activeEl.addEventListener('loadedmetadata', adopt);
    return () => {
      activeEl.removeEventListener('durationchange', adopt);
      activeEl.removeEventListener('loadedmetadata', adopt);
    };
  }, [duration, activeEl, setDurationSafe]);

  // Live-test Task 8 (owner decision 2026-10-27 11:20): "let restarting be a
  // separate button so that previous always means previous". So restart is its
  // OWN action — seek to 0 on what is already loaded. It does NOT advance the
  // queue, does NOT re-resolve the source, and does not stop playback: an
  // element that is playing keeps playing from the top, a paused one simply
  // sits at 0. Nothing loaded means nothing to restart.
  const restart = useCallback(() => {
    const el = activeEl;
    if (!el) return;
    el.currentTime = 0;
    setPlaybackState({
      episode_id: currentEpisode?.id ?? playbackState?.episode_id ?? '',
      position_seconds: 0,
      duration_seconds: playbackState?.duration_seconds,
    });
  }, [activeEl, currentEpisode, playbackState, setPlaybackState]);

  // Smart-link one-tap switch. The twin comes from the backend (every read
  // path attaches linked_episode_id); position carries by PERCENTAGE because
  // the podcast and video cuts of one episode rarely share a length (intros,
  // ads), which is the spec's "rough sync via timestamp %". The playing queue
  // slot is repointed at the twin so the queue shows what actually plays.
  const switchToLinked = useCallback(async () => {
    const from = currentEpisodeRef.current;
    if (!from?.linked_episode_id) return;
    const twin = await episodeCommands.get(from.linked_episode_id);
    const state = usePlayerStore.getState().playbackState;
    const pos = state?.position_seconds ?? 0;
    const fromLen = state?.duration_seconds || from.duration_seconds || 0;
    const ratio = fromLen > 0 ? Math.min(1, Math.max(0, pos / fromLen)) : 0;
    const startAt = twin.duration_seconds ? ratio * twin.duration_seconds : pos;
    const { items, currentIndex } = useQueueStore.getState();
    if (items[currentIndex]?.episode?.id === from.id) {
      useQueueStore.setState({
        items: items.map((it, i) =>
          i === currentIndex ? { ...it, episode: twin, episode_id: twin.id } : it,
        ),
      });
    }
    const hasVideoStream = !!twin.video_id || !!twin.video_url;
    // Owner 2026-11-03 round 2: an explicit 'video' mode here overrode the
    // standing audio-only toggle in formatFor, so switching to the YouTube
    // version silently dropped audio-only. A video-capable twin passes NO
    // mode — the toggle decides; a podcast twin (no video) is always 'audio'.
    playRef.current({ ...twin, progress_seconds: startAt }, hasVideoStream ? undefined : 'audio');
  }, []);

  // Review Focus 4: the ends are no-ops, and the BUTTONS must be disabled so
  // the state is visible instead of a press that silently does nothing.
  // Forward is available at the last item only under repeat 'all', which really
  // does wrap (queueSlice.nextTrack). Back never wraps — previous means
  // previous — so at the first item it is genuinely unavailable.
  const hasNext =
    items.length > 0 && (currentIndex < items.length - 1 || repeatMode === 'all');
  const hasPrevious = items.length > 0 && currentIndex > 0;

  const value: PlayerContextType = {
    currentEpisode: currentEpisode ?? items[currentIndex]?.episode ?? null,
    isPlaying,
    playbackFormat,
    isAudioMode,
    isPip,
    canPip,
    volume,
    playbackRate,
    progress: duration > 0 ? (position / duration) * 100 : 0,
    currentTime: position,
    duration,
    play,
    load,
    pause,
    togglePlay,
    seek,
    setVolume,
    toggleMute,
    setPlaybackRate,
    setAudioMode,
    togglePip,
    nextTrack,
    previousTrack,
    restart,
    hasNext,
    hasPrevious,
    switchToLinked,
    registerVideoElement,
  };

  // macOS Now Playing + hardware media keys, and the native Playback menu (step 2d).
  useMediaSession(value);
  useMenuPlayback(value);

  return (
    <PlayerContext.Provider value={value}>
      {/* Hidden audio engine: hosts all audio playback and the audio side of
          format switching. The video element is registered by PlayerScreen. */}
      <audio ref={audioRef} hidden preload="metadata" />
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
}
