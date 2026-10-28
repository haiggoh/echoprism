#!/usr/bin/env bash
# Regenerate the sqlx offline query cache (.sqlx/) from a FRESH database built
# from the app's own schema — never from a leftover dev database.
#
# Why this exists (live-test 2026-10-27, Task 5): `cargo sqlx prepare` needs a
# DATABASE_URL. Pointing it at the repo's src-tauri/echoprism.db — a scratch
# database from 13 Oct — produced a cache built from a STALE schema: that file
# predates `user_preferences.card_click_action`, which `CREATE TABLE IF NOT
# EXISTS` never adds to an existing table. sqlx then inferred the wrong column
# nullability and reported phantom type errors in UNRELATED pre-existing code
# (`String: From<Option<String>>`, `can't compare bool with {integer}`), which
# cost several verify cycles and looked like real defects.
#
# The repo's dev database cannot be trusted as an input, so this script builds
# a throwaway one from sql/schema.sql + indexes.sql + fts.sql (exactly what
# db::migrations::run applies at startup) and prepares against that.
#
# Usage:
#   scripts/sqlx-prepare.sh            # regenerate .sqlx/
#   scripts/sqlx-prepare.sh --help     # this message
#   scripts/sqlx-prepare.sh --check    # verify only: is the cache current?
#
# Environment variables read: SQLX_CLI (default "cargo sqlx") — override to use
# a different sqlx-cli invocation. Everything else is derived from the repo.
#
# Exit codes: 0 = cache written and current, 1 = prepare failed or a
# prerequisite is missing, 2 = usage error.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TAURI_DIR="$REPO_ROOT/src-tauri"
SQL_DIR="$TAURI_DIR/sql"
SQLX="${SQLX_CLI:-cargo sqlx}"

usage() {
  cat <<'EOF'
sqlx-prepare.sh — regenerate the .sqlx offline query cache safely

What it does, in order:
  1. creates a throwaway SQLite database in a temp dir,
  2. applies sql/schema.sql, then sql/indexes.sql, then sql/fts.sql — the
     same three files db::migrations::run applies at startup, so the cache
     is built from the CURRENT schema,
  3. inserts the single local user row the backend FKs to,
  4. runs `cargo sqlx prepare` against that database, and
  5. deletes the temp database.

It never touches the repo's src-tauri/echoprism.db and never touches the
owner's real database (~/Library/Application Support/app.echoprism/).

Arguments:
  --help     show this message and exit
  --check    do not write; report whether the cache is already current
             (runs prepare in a copy of the repo's .sqlx and diffs it)
No other arguments are accepted.

Environment variables read:
  SQLX_CLI   the sqlx-cli invocation to use (default: cargo sqlx)

Exit codes: 0 = cache current/written, 1 = failure, 2 = usage error.

WHY: a changed `query!` is compile-gated in this repo — the .sqlx hash changes
and the build fails before any test runs — so the cache must be regenerated
whenever SQL changes. Preparing against a STALE database makes sqlx infer the
wrong nullability and emits phantom errors in untouched files.
EOF
}

CHECK_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --help|-h) usage; exit 0 ;;
    --check) CHECK_ONLY=true ;;
    *) echo "sqlx-prepare.sh: unknown argument '$arg'" >&2; usage >&2; exit 2 ;;
  esac
done

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "MISSING prerequisite: $1 — install it and re-run." >&2
    exit 1
  fi
  printf 'ok: %s\n' "$1"
}

for sqlfile in schema.sql indexes.sql fts.sql; do
  if [[ ! -f "$SQL_DIR/$sqlfile" ]]; then
    echo "MISSING schema file: $SQL_DIR/$sqlfile" >&2
    exit 1
  fi
done

echo "== prerequisites =="
need sqlite3
need cargo
# sqlx-cli is invoked as "$SQLX ...", so check the first word and, if it is
# cargo, confirm the subcommand exists rather than inventing a version flag.
if [[ "$SQLX" == cargo* ]]; then
  if ! cargo sqlx --version >/dev/null 2>&1; then
    echo "MISSING prerequisite: sqlx-cli — install with:" >&2
    echo "  cargo install sqlx-cli --no-default-features --features sqlite" >&2
    exit 1
  fi
  printf 'ok: %s\n' "$(cargo sqlx --version 2>/dev/null | head -1)"
else
  need "${SQLX%% *}"
fi

# One temp DIRECTORY for everything, cleaned on any exit path.
# ⚠️ `mktemp -d`, not bare `mktemp`: without -d it creates a FILE, and every
# path built underneath it then fails with "unable to open database file" —
# which reads like a permissions or sqlx problem rather than a missing flag.
# (Measured: this script's first version did exactly that.) The Xs sit at the
# END of the template because BSD mktemp randomises only trailing Xs.
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ep-sqlx-prepare.XXXXXX")"
cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT

DB="$WORK_DIR/fresh.db"

echo "== building a fresh database from the app's own schema =="
for sqlfile in schema.sql indexes.sql fts.sql; do
  sqlite3 "$DB" < "$SQL_DIR/$sqlfile"
  printf 'applied: %s\n' "$sqlfile"
done
# The backend is single-user: every channel FKs to this row, and
# db::migrations::run inserts it too.
sqlite3 "$DB" "INSERT OR IGNORE INTO users (id) VALUES ('current-user');"

if [[ "$CHECK_ONLY" == true ]]; then
  # --check never writes, so the live cache is safe; verify against the fresh DB
  # from inside the crate (sqlx refuses to run outside the manifest directory).
  echo "== verifying the cache is current (dry run, no writes) =="
  if (cd "$TAURI_DIR" && DATABASE_URL="sqlite://$DB" $SQLX prepare --check >/dev/null 2>&1); then
    echo "CACHE CURRENT — .sqlx matches the queries in the source."
    exit 0
  else
    echo "CACHE STALE — run scripts/sqlx-prepare.sh (no flag) to regenerate." >&2
    exit 1
  fi
fi

echo "== regenerating the .sqlx offline query cache =="
# sqlx only runs inside the Cargo manifest directory, so the invocation has to
# happen from src-tauri/ (running it from the repo root fails with
# "Failed to read Cargo.toml" — measured).
if ! (cd "$TAURI_DIR" && DATABASE_URL="sqlite://$DB" $SQLX prepare); then
  echo "sqlx prepare FAILED — see the output above. The .sqlx cache may be" >&2
  echo "partially updated; if so, restore it with:  git checkout -- src-tauri/.sqlx" >&2
  exit 1
fi

echo
echo "DONE — .sqlx regenerated from a fresh schema database."
echo "Reminder: commit src-tauri/.sqlx, it is a TRACKED derived artifact."
