// @ts-expect-error the repo does not ship @types/node, so tsc cannot resolve node:fs (see the contract test's header)
import { existsSync, readFileSync } from 'node:fs';
// @ts-expect-error the repo does not ship @types/node
import path from 'node:path';
// @ts-expect-error the repo does not ship @types/node
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Live-test Task 6: `event.listen not allowed … core:event:allow-listen`
 * appeared four times in crash-reports.jsonl (2026-10-27 09:47–10:01 UTC)
 * because the app shipped with NO capabilities at all — there was no
 * `src-tauri/capabilities/` directory, so the ACL was empty and every IPC
 * call was denied. It broke the native Playback menu
 * (src/hooks/useMenuPlayback.ts), which subscribes with `listen()`.
 *
 * This test pins the invariant so it cannot regress silently: the capability
 * file must exist, must target the MAIN window (the label tauri.conf.json's
 * single window gets by default), and must carry core:default.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAURI_DIR = path.join(repoRoot, 'src-tauri');
const CAP_FILE = path.join(TAURI_DIR, 'capabilities', 'default.json');
const CONF_FILE = path.join(TAURI_DIR, 'tauri.conf.json');

function readJson(file: string): any {
  return JSON.parse(readFileSync(file, 'utf8'));
}

describe('Tauri capabilities (live-test Task 6)', () => {
  it('the default capability file exists', () => {
    expect(
      existsSync(CAP_FILE),
      'src-tauri/capabilities/default.json must exist — with no capabilities directory the ACL is empty and IPC is denied',
    ).toBe(true);
  });

  it('targets the main window and carries core:default', () => {
    const cap = readJson(CAP_FILE);
    const conf = readJson(CONF_FILE);

    // The conf declares exactly ONE window with no explicit label, so Tauri
    // gives it the default label "main" (tauri-utils config.rs: the label
    // defaults to "main" when unspecified). Derive it from the conf rather
    // than hardcoding, so adding a labelled window fails loudly here.
    const windows = conf.app?.windows ?? [];
    expect(windows.length, 'fixture: exactly one window in tauri.conf.json').toBe(1);
    expect(windows[0].label, 'fixture: the window declares no explicit label').toBeUndefined();

    expect(cap.windows, 'the capability must target the main window').toEqual(['main']);
    expect(cap.permissions, 'core:default is the baseline every Tauri app carries').toContain(
      'core:default',
    );
  });

  it('tauri-build picked the capability up (the generated manifest lists it)', () => {
    const gen = path.join(TAURI_DIR, 'gen', 'schemas', 'capabilities.json');
    if (!existsSync(gen)) {
      // gen/ is produced by a build; a clean checkout has not built yet.
      return;
    }
    const caps = readJson(gen);
    // The shape is { "<identifier>": { ... } } once tauri-build has run.
    expect(
      Object.keys(caps).length,
      'tauri-build must discover the capability, otherwise the ACL is still empty',
    ).toBeGreaterThan(0);
  });
});
