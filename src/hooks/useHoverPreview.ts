import { useCallback, useEffect, useRef, useState } from 'react';
import { previewCommands } from './useTauriCommands';
import type { StoryboardSpec } from '../types';

/**
 * Phase E: hover-preview mechanics, deliberately ISOLATED — this module and
 * `ui/EpisodePreview.tsx` are the feature's whole footprint, imported only
 * by EpisodeCard. The owner's unplug requirement: flip previewConfig.enabled to
 * false (or delete these two files and that one import) and the feature is
 * gone; call sites never see the internals.
 *
 * Cost model (the research that shaped this): the preview is a STORYBOARD
 * SPRITE, never a video stream — one source call per NEW hovered video id
 * (bounded LRU below; re-hovers reuse), frames advance on a timer. A
 * missing storyboard degrades to the static thumbnail.
 */

/** The unplug switch itself — a mutable FIELD so the tested unplug
 *  assertion can flip it the same way production would. */
export const previewConfig = { enabled: true };

export const PREVIEW_DELAY_MS = 600;
export const PREVIEW_LRU_CAP = 8;

/** Bounded LRU of resolved storyboards keyed on video id. Pure and
 *  testable: put beyond the cap evicts the LEAST recently used; get
 *  refreshes recency. */
export class StoryboardLru {
  private map = new Map<string, StoryboardSpec>();

  get(id: string): StoryboardSpec | undefined {
    const hit = this.map.get(id);
    if (hit !== undefined) {
      this.map.delete(id);
      this.map.set(id, hit); // refresh recency
    }
    return hit;
  }

  put(id: string, spec: StoryboardSpec): void {
    this.map.delete(id);
    this.map.set(id, spec);
    while (this.map.size > PREVIEW_LRU_CAP) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  get size(): number {
    return this.map.size;
  }
}

/** Previews are a hover-only enhancement: a touch/coarse pointer never
 *  hovers, and reduced-motion users opted out of motion (2b's bar). */
export function previewCapability(): boolean {
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
    return window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false;
  } catch {
    return false;
  }
}

/** Shared resolved-storyboard cache (module scope: re-hovers across cards
 *  reuse one call per video). */
const cache = new StoryboardLru();

export interface HoverPreviewState {
  /** The storyboard once resolved; null while pending or when none exists. */
  spec: StoryboardSpec | null;
  /** The frame to draw (within the FIRST page). */
  frameIndex: number;
  /** Wire onto the hover target. */
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

export function useHoverPreview(videoId: string | undefined): HoverPreviewState {
  const [hovering, setHovering] = useState(false);
  const [delayed, setDelayed] = useState(false);
  const [spec, setSpec] = useState<StoryboardSpec | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const capable = previewCapability();
  const active = previewConfig.enabled && capable && hovering && delayed && !!videoId;

  // The delay timer: starts on enter, cancelled by leave.
  useEffect(() => {
    if (!previewConfig.enabled || !capable || !hovering || !videoId) {
      setDelayed(false);
      return;
    }
    timerRef.current = setTimeout(() => setDelayed(true), PREVIEW_DELAY_MS);
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [hovering, capable, videoId]);

  // Resolution: cache hit is synchronous; a miss makes the ONE source call.
  useEffect(() => {
    if (!active || !videoId) return;
    const cached = cache.get(videoId);
    if (cached) {
      setSpec(cached);
      return;
    }
    setSpec(null);
    let cancelled = false;
    previewCommands
      .frames(videoId)
      .then((resolved) => {
        if (cancelled || !resolved) return;
        cache.put(videoId, resolved);
        setSpec(resolved);
      })
      .catch(() => {
        /* a preview failure must never surface — the thumbnail stays */
      });
    return () => {
      cancelled = true;
    };
  }, [active, videoId]);

  // Frame animation within the first page (the sprite technique's driver).
  useEffect(() => {
    if (!spec || spec.duration_per_frame_ms <= 0) return;
    const perPage = spec.frames_per_page_x * spec.frames_per_page_y;
    const frames = Math.min(perPage, spec.total_count || perPage);
    if (frames <= 1) return;
    const timer = setInterval(() => {
      setFrameIndex((i) => (i + 1) % frames);
    }, spec.duration_per_frame_ms);
    return () => clearInterval(timer);
  }, [spec]);

  const onPointerEnter = useCallback(() => setHovering(true), []);
  const onPointerLeave = useCallback(() => {
    setHovering(false);
    setDelayed(false);
    setSpec(null);
    setFrameIndex(0);
  }, []);

  return { spec: active ? spec : null, frameIndex, onPointerEnter, onPointerLeave };
}
