#!/bin/bash
# test_version_consistency.sh — EchoPrism's version gate: every version surface must agree.
#
# rtc-ship.sh runs this file IN PLACE OF its built-in check whenever it is executable
# (rtc-ship.json can declare only ONE json manifest, and its other key, version_file,
# would overwrite a file with a bare version string). EchoPrism ships its version in five
# places; the .dmg takes its version from tauri.conf.json, which the built-in check could
# not see (found 2026-11-05 shipping 0.1.11: it stayed 0.1.10 until bumped by hand).
#
# Usage:
#   tests/test_version_consistency.sh [--help] [<repo-root>]
#
# <repo-root> defaults to the directory above this script. Exit 0 when all surfaces
# agree, 1 on a split OR on any surface that yields no version (an empty extraction is a
# failure, never a pass), 2 on a usage error. No environment variables.

set -u

usage() { sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; }

root=""
for arg in "$@"; do
  case "$arg" in
    -h|--help) usage; exit 0 ;;
    -*) echo "test_version_consistency.sh: unknown option: $arg" >&2
        echo "usage: tests/test_version_consistency.sh [--help] [<repo-root>]" >&2; exit 2 ;;
    *) if [ -n "$root" ]; then echo "test_version_consistency.sh: one repo root only" >&2; exit 2; fi
       root=$arg ;;
  esac
done
[ -n "$root" ] || root=$(cd "$(dirname "$0")/.." && pwd)
[ -d "$root" ] || { echo "✖ repo root not found: $root" >&2; exit 2; }

python3 - "$root" <<'PY'
import json, os, re, sys

root = sys.argv[1]

def read(rel):
    p = os.path.join(root, rel)
    return open(p, encoding="utf-8").read() if os.path.isfile(p) else None

def json_version(rel):
    t = read(rel)
    if t is None:
        return None
    try:
        return json.loads(t).get("version") or None
    except ValueError:
        return None

def cargo_toml_version(rel):
    # the [package] table's own version — not a dependency's
    t = read(rel)
    if t is None:
        return None
    m = re.search(r'^\[package\]\s*$(.*?)(?=^\[|\Z)', t, re.M | re.S)
    if not m:
        return None
    v = re.search(r'^version\s*=\s*"([^"]+)"', m.group(1), re.M)
    return v.group(1) if v else None

def cargo_lock_version(rel, crate):
    t = read(rel)
    if t is None:
        return None
    m = re.search(r'^name = "%s"\nversion = "([^"]+)"' % re.escape(crate), t, re.M)
    return m.group(1) if m else None

def changelog_top(rel):
    t = read(rel)
    if t is None:
        return None
    m = re.search(r'^##+\s+\[?([0-9]+\.[0-9]+\.[0-9]+)\]?', t, re.M)
    return m.group(1) if m else None

surfaces = [
    ("package.json", json_version("package.json")),
    ("src-tauri/tauri.conf.json", json_version("src-tauri/tauri.conf.json")),
    ("src-tauri/Cargo.toml [package]", cargo_toml_version("src-tauri/Cargo.toml")),
    ("src-tauri/Cargo.lock (echoprism)", cargo_lock_version("src-tauri/Cargo.lock", "echoprism")),
    ("CHANGELOG.md (top entry)", changelog_top("CHANGELOG.md")),
]

bad = False
for name, v in surfaces:
    print("  %-34s : %s" % (name, v or "<none>"))
    if not v:
        print("✖ %s yields no version (an empty extraction is a failure)" % name, file=sys.stderr)
        bad = True
found = {v for _, v in surfaces if v}
if len(found) > 1:
    print("✖ version surfaces disagree: %s" % ", ".join(sorted(found)), file=sys.stderr)
    bad = True
if bad:
    sys.exit(1)
print("  all %d version surfaces agree: %s" % (len(surfaces), found.pop()))
PY
