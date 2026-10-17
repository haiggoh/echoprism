/**
 * The single invoke choke point. Every command wrapper in
 * hooks/useTauriCommands.ts routes through here so the app can run in two
 * worlds:
 *   - inside the Tauri shell (__TAURI_INTERNALS__ present) -> real backend;
 *   - plain browser dev / e2e (`npm run dev`) -> the fixture mock router.
 * The Tauri check happens at CALL time, so import order can never flip it.
 */
import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { mockInvoke } from './mocks/router';

/** The real backend invoke, re-exported for tests that assert delegation. */
export const coreInvoke = tauriInvoke;

export function invoke<T = unknown>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    return tauriInvoke<T>(cmd, args);
  }
  return mockInvoke<T>(cmd, args);
}
