/**
 * D7 (design-decisions.md) — per-title-family play-mode rules. A rule maps
 * (channel, title substring pattern) → default play mode ('video' | 'audio'),
 * so one channel with two title families can default differently per family
 * (owner case: 'Some More News…' plays video, 'Even More News…' plays audio).
 *
 * Contract under test here: the three IPC commands (list/set/remove), the
 * upsert semantics (same channel+pattern REPLACES, never duplicates), the
 * channel filter, and the seeded fixtures that Phase 3's chain will consult.
 * Rust-side behavior is exercised by the cargo test in queries.rs; the
 * tauri-command-contract test pins wrapper ↔ registration parity.
 */
import { beforeEach, describe, it, expect } from 'vitest';
import { mockInvoke, resetMockState } from '../mocks/router';
import type { PlayModeRule } from '../types';

describe('play-mode rules commands (D7)', () => {
  beforeEach(() => {
    resetMockState();
  });

  it('lists seeded rules', async () => {
    const rules = await mockInvoke<PlayModeRule[]>('list_play_mode_rules');
    expect(rules).toHaveLength(2);
    const smn = rules.find((r) => r.channel_id === 'ch-3');
    expect(smn).toMatchObject({ title_pattern: 'Some More News', play_mode: 'video' });
    const emn = rules.find((r) => r.channel_id === 'ch-4');
    expect(emn).toMatchObject({ title_pattern: 'Even More News', play_mode: 'audio' });
  });

  it('filters by channel', async () => {
    const rules = await mockInvoke<PlayModeRule[]>('list_play_mode_rules', { channelId: 'ch-4' });
    expect(rules).toHaveLength(1);
    expect(rules[0]?.title_pattern).toBe('Even More News');
  });

  it('set creates a rule and returns it with an id', async () => {
    const rule = await mockInvoke<PlayModeRule>('set_play_mode_rule', {
      channelId: 'ch-1',
      titlePattern: 'Deep Dive',
      playMode: 'audio',
    });
    expect(rule.id).toBeTruthy();
    expect(rule).toMatchObject({ channel_id: 'ch-1', title_pattern: 'Deep Dive', play_mode: 'audio' });
    const all = await mockInvoke<PlayModeRule[]>('list_play_mode_rules');
    expect(all).toHaveLength(3);
  });

  it('set is an upsert: same channel+pattern replaces, never duplicates', async () => {
    const first = await mockInvoke<PlayModeRule>('set_play_mode_rule', {
      channelId: 'ch-1',
      titlePattern: 'Deep Dive',
      playMode: 'audio',
    });
    const second = await mockInvoke<PlayModeRule>('set_play_mode_rule', {
      channelId: 'ch-1',
      titlePattern: 'Deep Dive',
      playMode: 'video',
    });
    expect(second.id).toBe(first.id);
    expect(second.play_mode).toBe('video');
    const all = await mockInvoke<PlayModeRule[]>('list_play_mode_rules');
    expect(all).toHaveLength(3);
  });

  it('set rejects a play mode outside video|audio', async () => {
    await expect(
      mockInvoke('set_play_mode_rule', {
        channelId: 'ch-1',
        titlePattern: 'X',
        playMode: 'unified',
      })
    ).rejects.toThrow(/video.*audio|audio.*video/i);
  });

  it('remove deletes by id', async () => {
    const created = await mockInvoke<PlayModeRule>('set_play_mode_rule', {
      channelId: 'ch-1',
      titlePattern: 'Temp',
      playMode: 'video',
    });
    await mockInvoke('remove_play_mode_rule', { ruleId: created.id });
    const all = await mockInvoke<PlayModeRule[]>('list_play_mode_rules');
    expect(all.find((r) => r.id === created.id)).toBeUndefined();
  });

  it('unknown rule id removal resolves without error (idempotent delete)', async () => {
    await expect(mockInvoke('remove_play_mode_rule', { ruleId: 'nope' })).resolves.toBeUndefined();
  });
});
