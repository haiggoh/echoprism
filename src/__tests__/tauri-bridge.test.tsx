// @vitest-environment jsdom
/**
 * Tauri bridge routing — the single invoke choke point (src/tauri-bridge.ts).
 * Inside the Tauri shell (__TAURI_INTERNALS__ present) it MUST delegate to the
 * real @tauri-apps/api/core invoke; in a plain browser it MUST serve the mock
 * router. The delegation direction is the dangerous one to get wrong: a mock
 * active inside the real app would silently bypass the Rust backend.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue('REAL_BACKEND'),
}));

import { invoke } from '../tauri-bridge';
import { coreInvoke } from '../tauri-bridge';

describe('tauri-bridge invoke routing', () => {
  beforeEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it('routes to the mock router when there is no Tauri shell', async () => {
    const result = await invoke('get_feed');
    expect(result).not.toBe('REAL_BACKEND');
    expect(Array.isArray(result)).toBe(true); // fixture episodes
  });

  it('delegates to the real invoke when __TAURI_INTERNALS__ is present', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    const result = await invoke('get_feed');
    expect(result).toBe('REAL_BACKEND');
    expect(coreInvoke).toHaveBeenCalledWith('get_feed', undefined);
  });
});
