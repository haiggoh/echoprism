/**
 * db:seed script contract (P3 phase 3). The script must apply the schema in
 * migrations order, then seed realistic data, idempotently, into any database
 * pointed at via --db. Tests run ONLY against temp databases — never the
 * owner's real app DB (adversarial review item 3 in the plan).
 */
// @ts-expect-error the repo does not ship @types/node (see migration-sql.test.ts)
import { execFileSync } from 'node:child_process';
// @ts-expect-error the repo does not ship @types/node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
// @ts-expect-error the repo does not ship @types/node
import { tmpdir } from 'node:os';
// @ts-expect-error the repo does not ship @types/node
import path from 'node:path';
// @ts-expect-error the repo does not ship @types/node
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(repoRoot, 'scripts', 'seed.mjs');

function runSeed(dbPath: string, extraArgs: string[] = []): string {
  return execFileSync('node', [SCRIPT, '--db', dbPath, ...extraArgs], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function sqlite(db: string, sql: string): string {
  return execFileSync('sqlite3', [db, sql], { encoding: 'utf8' });
}

function withTempDb(run: (db: string, dir: string) => void): void {
  const dir = mkdtempSync(path.join(tmpdir(), 'echoprism-seed-'));
  try {
    run(path.join(dir, 'test.db'), dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('db:seed script', () => {
  it('--help prints usage and exits 0 without touching any database', () => {
    const out = execFileSync('node', [SCRIPT, '--help'], { encoding: 'utf8' });
    expect(out).toMatch(/--db/);
    expect(out).toMatch(/--seed/);
  });

  it('seeds schema + data into a fresh database and reports counts', () => {
    withTempDb((db) => {
      const out = runSeed(db);
      expect(out).toMatch(/episodes: 8/);
      expect(out).toMatch(/channels: 4/);
      expect(sqlite(db, 'SELECT COUNT(*) FROM episodes;').trim()).toBe('8');
      expect(sqlite(db, 'SELECT COUNT(*) FROM channels;').trim()).toBe('4');
      // D7 fixtures: the two-stream show with its per-family play-mode rules
      expect(sqlite(db, 'SELECT COUNT(*) FROM play_mode_rules;').trim()).toBe('2');
      expect(sqlite(db, "SELECT play_mode FROM play_mode_rules WHERE title_pattern='Some More News';").trim()).toBe('video');
      expect(sqlite(db, "SELECT play_mode FROM play_mode_rules WHERE title_pattern='Even More News';").trim()).toBe('audio');
      expect(
        sqlite(db, "SELECT card_click_action FROM user_preferences WHERE user_id='current-user';").trim()
      ).toBe('auto'); // D2 default
      expect(
        sqlite(db, "SELECT auto_download_wifi FROM user_preferences WHERE user_id='current-user';").trim()
      ).toBe('0'); // D1: no auto-download
    });
  });

  it('is idempotent: seeding twice does not duplicate rows', () => {
    withTempDb((db) => {
      runSeed(db);
      runSeed(db);
      expect(sqlite(db, 'SELECT COUNT(*) FROM episodes;').trim()).toBe('8');
      expect(sqlite(db, 'SELECT COUNT(*) FROM channels;').trim()).toBe('4');
      expect(sqlite(db, 'SELECT COUNT(*) FROM play_mode_rules;').trim()).toBe('2');
    });
  });

  it('a broken seed file fails the run with a non-zero exit', () => {
    withTempDb((db, dir) => {
      const bad = path.join(dir, 'bad.sql');
      writeFileSync(bad, 'CREATE TABLE oops(;');
      expect(() => runSeed(db, ['--seed', bad])).toThrow();
    });
  });
});
