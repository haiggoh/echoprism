/**
 * Migration SQL smoke — the three schema files must execute green IN SEQUENCE
 * against a real SQLite database, in exactly the order migrations.rs runs them
 * (schema.sql -> indexes.sql -> fts.sql).
 *
 * Regression context (2026-10-15): indexes.sql carried a duplicated section
 * whose statements lacked terminating semicolons; the following `-- comment`
 * line swallowed the statement boundary and the parser died on the NEXT
 * CREATE — which would have failed app startup (migrations::run ->
 * execute_batch -> Err) while every "compilation: 0 errors" claim stayed true.
 * This test exists so that state can never pass silently again.
 */
// @ts-expect-error the repo does not ship @types/node (see tauri-command-contract.test.ts)
import { execFileSync } from 'node:child_process';
// @ts-expect-error the repo does not ship @types/node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
// @ts-expect-error the repo does not ship @types/node
import { tmpdir } from 'node:os';
// @ts-expect-error the repo does not ship @types/node
import path from 'node:path';
// @ts-expect-error the repo does not ship @types/node
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SQL_DIR = path.join(repoRoot, 'src-tauri', 'sql');

/** The app runs these files in this order at startup (migrations.rs::run). */
const MIGRATION_FILES = ['schema.sql', 'indexes.sql', 'fts.sql'];

/** Objects whose absence would mean a file silently did nothing. */
const MUST_EXIST = [
  'user_preferences',          // schema.sql
  'episodes',                  // schema.sql
  'idx_history_episode',       // indexes.sql (the once-broken statement)
  'idx_podcast_feeds_user',    // indexes.sql (the once-duplicated section)
  'idx_sponsorblock_expires',  // indexes.sql
  'episodes_fts',              // fts.sql
];

describe('migration sql', () => {
  it('executes schema -> indexes -> fts green in sequence', () => {
    try {
      execFileSync('sqlite3', ['--version'], { stdio: 'pipe' });
    } catch {
      // sqlite3 CLI unavailable on this machine — nothing to verify against.
      return;
    }

    const dir = mkdtempSync(path.join(tmpdir(), 'echoprism-migration-'));
    const db = path.join(dir, 'app.db');
    try {
      for (const file of MIGRATION_FILES) {
        // execFileSync throws (test fails) if the CLI exits non-zero, which
        // sqlite3 does on ANY parse error in the fed file.
        execFileSync('sqlite3', [db], {
          input: readFileSync(path.join(SQL_DIR, file)),
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      }

      // Positive existence check: a file that parsed but created nothing
      // (e.g. statements swallowed by a comment) must not pass.
      const objects = execFileSync(
        'sqlite3',
        [db, "SELECT name FROM sqlite_master WHERE type IN ('table','index');"],
        { encoding: 'utf8' }
      );
      for (const expected of MUST_EXIST) {
        expect(objects).toContain(expected);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
