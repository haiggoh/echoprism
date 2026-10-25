/**
 * D7 (design-decisions.md) — the play-mode consultation chain, extracted so
 * BOTH surfaces that resolve it can share one implementation:
 *
 *   1. a matching per-channel play-mode rule (first match wins; the backend
 *      returns rules priority-ordered)
 *   2. the channel's format_preference ('both' = no override)
 *   3. undefined — no override; the engine then applies its own defaults
 *      (global audio toggle, capability fallback)
 *
 * It lives here rather than in useEpisodePlay because PlayerProvider needs it
 * too (queue advance resolves at play time), and importing it from that hook
 * created a PlayerProvider <-> useEpisodePlay cycle. Pure: no Tauri calls, no
 * React, so it is directly unit-testable (d7-play-mode-chain.test.tsx).
 */
import type { Channel, Episode, PlayMode, PlayModeRule } from '../types';

export function resolveDefaultPlayMode(
  episode: Episode,
  rules: PlayModeRule[],
  channels: Channel[]
): PlayMode | undefined {
  // Pattern semantics v1 (plan, binding): case-insensitive substring.
  const title = episode.title.toLowerCase();
  const matched = rules.find(
    (r) => r.channel_id === episode.channel_id && title.includes(r.title_pattern.toLowerCase())
  );
  if (matched) return matched.play_mode;
  const channel = channels.find((c) => c.id === episode.channel_id);
  if (channel && channel.format_preference !== 'both') return channel.format_preference;
  return undefined;
}
