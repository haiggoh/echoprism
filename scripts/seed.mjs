#!/usr/bin/env node
/**
 * db:seed — create and/or seed an EchoPrism SQLite database for development.
 *
 * Applies the schema files (same order as the migration smoke test) and then
 * the seed data (scripts/seed.sql) through the `sqlite3` CLI. Safe to re-run:
 * schema files are IF NOT EXISTS, seed rows are INSERT OR IGNORE.
 *
 * Usage:
 *   node scripts/seed.mjs [--db <path>] [--seed <file>]
 *
 *   --db <path>    Target database file. Default: the app's real location,
 *                  derived from the identifier in src-tauri/tauri.conf.json
 *                  (same path src-tauri/src/db/mod.rs uses: <app_data_dir>/<id>/echoprism.db).
 *   --seed <file>  Seed SQL file. Default: scripts/seed.sql (next to this script).
 *   --help, -h     Show this help and exit 0.
 *
 * Environment: requires the `sqlite3` CLI on PATH. No other environment
 * variables are read.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

// Keep in sync with MIGRATION_FILES in src/__tests__/migration-sql.test.ts
// (order matters: tables -> indexes -> fts/triggers).
const SCHEMA_FILES = ['schema.sql', 'indexes.sql', 'fts.sql'];

const DB_FILENAME = 'echoprism.db'; // src-tauri/src/db/mod.rs

function usage() {
  console.log(`db:seed — create and/or seed an EchoPrism SQLite database (dev tool).

Usage: node scripts/seed.mjs [--db <path>] [--seed <file>]

  --db <path>    Target database file (default: the app's real location,
                 derived from src-tauri/tauri.conf.json's identifier).
  --seed <file>  Seed SQL file (default: scripts/seed.sql).
  --help, -h     Show this help.

Applies src-tauri/sql/{schema,indexes,fts}.sql then the seed file via the
sqlite3 CLI. Idempotent — safe to re-run. Never touches a live database
unless --db is omitted (then it seeds the real app DB).`);
}

function defaultDbPath() {
  // Mirror Tauri's app_data_dir(): identifier from tauri.conf.json, platform
  // standard location, then the DB filename used by src-tauri/src/db/mod.rs.
  const { identifier } = JSON.parse(
    readFileSync(path.join(repoRoot, 'src-tauri', 'tauri.conf.json'), 'utf8')
  );
  let base;
  switch (process.platform) {
    case 'darwin':
      base = path.join(os.homedir(), 'Library', 'Application Support', identifier);
      break;
    case 'win32':
      base = path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), identifier);
      break;
    default:
      base = path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share'), identifier);
  }
  return path.join(base, DB_FILENAME);
}

function runSqlFile(dbPath, sqlPath) {
  const result = spawnSync('sqlite3', [dbPath], {
    input: readFileSync(sqlPath, 'utf8'),
    encoding: 'utf8',
  });
  if (result.error) {
    console.error(`db:seed: cannot run sqlite3 (${result.error.message}). Is the sqlite3 CLI installed?`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`db:seed: sqlite3 failed applying ${sqlPath} (exit ${result.status})`);
    if (result.stderr) console.error(result.stderr);
    process.exit(1);
  }
}

function main() {
  const args = process.argv.slice(2);
  let dbPath = defaultDbPath();
  let seedPath = path.join(SCRIPT_DIR, 'seed.sql');

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      usage();
      return;
    }
    if (arg === '--db' || arg === '--seed') {
      const value = args[++i];
      if (!value) {
        console.error(`db:seed: ${arg} requires a value\n`);
        usage();
        process.exit(1);
      }
      if (arg === '--db') dbPath = value;
      else seedPath = value;
      continue;
    }
    console.error(`db:seed: unknown argument '${arg}'\n`);
    usage();
    process.exit(1);
  }

  if (!seedPath.startsWith('/')) seedPath = path.resolve(process.cwd(), seedPath);

  mkdirSync(path.dirname(dbPath), { recursive: true });

  const sqlDir = path.join(repoRoot, 'src-tauri', 'sql');
  for (const file of SCHEMA_FILES) {
    runSqlFile(dbPath, path.join(sqlDir, file));
  }
  runSqlFile(dbPath, seedPath);

  const count = (table) => {
    const r = spawnSync('sqlite3', [dbPath, `SELECT COUNT(*) FROM ${table};`], { encoding: 'utf8' });
    return r.status === 0 ? r.stdout.trim() : '?';
  };
  console.log(`db:seed: seeded ${dbPath}`);
  console.log(`episodes: ${count('episodes')}`);
  console.log(`channels: ${count('channels')}`);
  console.log(`instances: ${count('instances')}`);
  console.log(`user_preferences: ${count('user_preferences')}`);
  console.log(`episode_links: ${count('episode_links')}`);
}

main();
