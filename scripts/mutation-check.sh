#!/usr/bin/env bash
# mutation-check.sh — break a guard on purpose, watch a test go red, restore SAFELY.
#
# WHY THIS EXISTS: three times in one day a mutation revert used
# `git checkout -- <file>` and destroyed the UNCOMMITTED work sitting in that
# file (twice measured, once nearly). `git checkout` restores the last COMMIT,
# not the working tree, so it silently discards everything not yet committed —
# the very work the mutation was testing. A restore must be a targeted string
# replacement from a real snapshot, never a git command.
#
# This script makes the safe path the easy path: it snapshots the file, applies a
# mutation, runs a test, then restores from the snapshot and PROVES the restore
# with cmp. There is no code path here that can touch git.
#
# Usage:
#   scripts/mutation-check.sh <file> <test-filter> <mutation-script.py>
#
#   <file>              the file to mutate
#   <test-filter>       passed to the test runner (a test name or a path)
#   <mutation-script.py>  a python script that edits <file> in place; it must
#                        print a line starting with "MUTATION" so its effect is
#                        visible in the output
#
# Environment variables read:
#   RUNNER   the test command (default: auto-detected — `cargo test --lib` under
#            src-tauri/, `./node_modules/.bin/vitest run` otherwise)
#
# Exit codes: 0 = the mutation was caught by a failing test AND the file was
#             restored byte-identically; 1 = setup/mutation/restore failure;
#             2 = usage error. Exit 3 = the mutation SURVIVED (the test passed
#             against broken code — that is a finding, not a pass).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
  cat <<'EOF'
mutation-check.sh — break a guard, prove a test catches it, restore safely

What it does, in order:
  1. snapshots the target file to a timestamped temp copy,
  2. runs your mutation script against it,
  3. runs the test filter and records whether it went RED,
  4. restores from the snapshot and verifies with cmp.

It never runs git. git checkout restores the last COMMIT, so using it to undo a
mutation destroys whatever uncommitted work is in the file — which cost real
work three times before this script existed.

Arguments:
  <file>                the file to mutate
  <test-filter>         test name or path passed to the runner
  <mutation-script.py>  python script editing <file> in place

Environment:
  RUNNER                override the test command

Exit codes: 0 = caught + restored, 1 = failure, 2 = usage, 3 = mutation survived
EOF
}

case "${1:-}" in
  --help|-h)
    usage
    exit 0
    ;;
esac

if [[ $# -ne 3 ]]; then
  echo "mutation-check.sh: expected 3 arguments, got $# — run --help." >&2
  usage >&2
  exit 2
fi
TARGET="$1"
FILTER="$2"
MUTATION="$3"

if [[ ! -f "$TARGET" ]]; then
  echo "mutation-check.sh: no such file: $TARGET" >&2
  exit 2
fi
if [[ ! -f "$MUTATION" ]]; then
  echo "mutation-check.sh: no such script: $MUTATION" >&2
  exit 2
fi
case "$1" in
  --help|-h) usage; exit 0 ;;
esac

# A snapshot path that cannot collide with the target.
SNAP="$(mktemp "${TMPDIR:-/tmp}/mut-snap.XXXXXX")"
cp -p "$TARGET" "$SNAP"
cleanup_restore() {
  cp -p "$SNAP" "$TARGET"
  if cmp -s "$SNAP" "$TARGET"; then
    echo "RESTORED byte-identically from the snapshot"
  else
    echo "RESTORE FAILED — snapshot at $SNAP, target differs" >&2
    exit 1
  fi
}
trap cleanup_restore EXIT

echo "== snapshot taken: $SNAP"
echo "== applying the mutation"
python3 -I "$MUTATION" "$TARGET"

echo "== running the test ($FILTER)"
if [[ -z "${RUNNER:-}" ]]; then
  case "$TARGET" in
    src-tauri/*) RUNNER=(cargo test --lib) ;;
    *)           RUNNER=(./node_modules/.bin/vitest run) ;;
  esac
fi
cd "$REPO_ROOT"
if "${RUNNER[@]}" "$FILTER" >/tmp/mutation-check.out 2>&1; then
  echo "MUTATION SURVIVED — the test passed against broken code."
  echo "This is a FINDING (an assertion that cannot fail), not a pass."
  exit 3
fi
echo "MUTATION CAUGHT — the test went red, as it must."
grep -E "FAIL|AssertionError|expected|→" /tmp/mutation-check.out | head -5 || true
