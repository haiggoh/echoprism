// @vitest-environment jsdom
/**
 * Phase 3: the mock router mirrors the Rust command's ImportResult contract.
 *
 * The Rust side (src-tauri/src/podcast/mod.rs `import_from_youtube`) was an
 * unwired stub whose insert was COMMENTED OUT — it built a Channel per
 * subscription, threw it away, and returned `imported: N`. The mock must not
 * repeat that shape: a count that rises across identical runs is exactly the
 * defect, so the mock dedupes on external_id exactly as the real command does.
 *
 * Verified shapes (not assumed): the mock's `list` returns the ARRAY of
 * channels, and there is no `subscribe` command in the mock world at all — an
 * earlier draft of this file asserted both wrongly.
 *
 * Discriminant: removing the `existing.has(...)` guard fails the second test.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mockInvoke, resetMockState } from '../mocks/router';

const IMPORT = 'import_youtube_subscriptions';

/** `list` returns the channel ARRAY; filter to the video tier the import walks. */
function videoChannels() {
  return mockInvoke<Array<{ external_id: string }>>('list', { params: { type: 'video' } });
}

beforeEach(() => resetMockState());

describe('Phase 3: import_youtube_subscriptions mock mirrors the dedupe', () => {
  it('the seeded video channels are already subscribed, so a fresh import imports 0', async () => {
    // The mock DB seeds ch-1/ch-3/ch-5 as VIDEO channels, so the returning-user
    // state is "all present" — the exact state that exposed the stub, which
    // reported `imported: N` regardless of what was already there.
    const seeded = await videoChannels();
    expect(seeded.length).toBeGreaterThan(0);

    const result = await mockInvoke<{ imported: number; errors: string[] }>(IMPORT, {
      instanceUrl: 'https://invidious.example.dev',
    });
    expect(result.imported).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it('importing twice reports 0 both times — the count never rises', async () => {
    const first = await mockInvoke<{ imported: number }>(IMPORT, {
      instanceUrl: 'https://invidious.example.dev',
    });
    const second = await mockInvoke<{ imported: number }>(IMPORT, {
      instanceUrl: 'https://invidious.example.dev',
    });
    expect(first.imported).toBe(0);
    // THE stub-defect assertion: the second run must not invent work.
    expect(second.imported).toBe(0);
  });

  it('an empty instance URL is rejected, not reported as "imported 0"', async () => {
    // The real command builds `{instance}/api/v1/subscriptions` and fails the
    // request; an empty URL is that failure in its cheapest form. Without the
    // guard a hand-typed empty value reads as a successful no-op.
    await expect(mockInvoke(IMPORT, { instanceUrl: '' })).rejects.toThrow(
      /instanceUrl is required/
    );
  });
});
