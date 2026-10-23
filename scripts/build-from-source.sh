#!/usr/bin/env bash
# Build EchoPrism from source — the 4c distribution route that needs no
# signing identity. Checks prerequisites, installs JS dependencies, and runs
# the Tauri release build, then prints where the app bundle landed.
#
# Usage:
#   scripts/build-from-source.sh            # full build
#   scripts/build-from-source.sh --help     # this message
#
# Environment variables read: none. Output: build receipts to stdout/stderr.
# Exit codes: 0 = built, 1 = missing prerequisite or build failure, 2 = usage.
set -euo pipefail

usage() {
  cat <<'EOF'
build-from-source.sh — build EchoPrism from source (unsigned, local)

What it does, in order:
  1. checks the build prerequisites (node, npm, cargo, rustc; yt-dlp is
     optional but search needs it at runtime),
  2. `npm ci` (installs the locked JS dependencies),
  3. `npm run tauri:build` (TypeScript + Vite production build, then the
     Rust release build and the macOS app bundle + dmg),
  4. prints the artifact paths and the unsigned first-launch note.

If only the decorative dmg step fails (its Finder AppleScript needs an
interactive desktop — it times out on headless sessions and CI), the script
falls back to a plain `hdiutil` dmg of the same app bundle and says so.

Arguments:
  --help    show this message and exit
No other arguments are accepted. The script reads no environment variables.

The produced app is UNSIGNED (no Apple Developer identity): on first launch
macOS may block it — right-click the app and choose Open, or run
`xattr -cr "<path to EchoPrism.app>"`. Builds cannot self-update; re-run
this script to update (scripts/check-updates.sh compares versions).
EOF
}

for arg in "$@"; do
  case "$arg" in
    --help|-h) usage; exit 0 ;;
    *) echo "build-from-source.sh: unknown argument '$arg'" >&2; usage >&2; exit 2 ;;
  esac
done

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "MISSING prerequisite: $1 — install it and re-run." >&2
    exit 1
  fi
  printf 'ok: %s %s\n' "$1" "$("$1" --version 2>/dev/null | head -1)"
}

echo "== prerequisites =="
need node
need npm
need cargo
need rustc
if command -v yt-dlp >/dev/null 2>&1; then
  echo "ok: yt-dlp $(yt-dlp --version 2>/dev/null)"
else
  echo "note: yt-dlp not found — the app runs, but search falls back to it; install with 'brew install yt-dlp'" >&2
fi

echo "== JS dependencies =="
npm ci

echo "== release build =="
app_path="src-tauri/target/release/bundle/macos/EchoPrism.app"
if ! build_log=$(npm run tauri:build 2>&1); then
  printf '%s\n' "$build_log"
  if printf '%s\n' "$build_log" | grep -q "error running bundle_dmg.sh"; then
    echo
    echo "The decorated dmg step failed (its Finder AppleScript needs an interactive"
    echo "desktop). Falling back to a plain hdiutil dmg of the SAME app bundle."
    [ -d "$app_path" ] || { echo "no app bundle was produced — the build failed for real" >&2; exit 1; }
    version=$(python3 -c "import json; print(json.load(open('src-tauri/tauri.conf.json'))['version'])")
    dmg_path="src-tauri/target/release/bundle/dmg/EchoPrism_${version}_aarch64.dmg"
    mkdir -p "$(dirname "$dmg_path")"
    hdiutil create -volname "EchoPrism" -srcfolder "$app_path" -ov -format UDZO "$dmg_path"
  else
    echo "build failed." >&2
    exit 1
  fi
else
  printf '%s\n' "$build_log" | tail -6
fi

version=$(python3 -c "import json; print(json.load(open('src-tauri/tauri.conf.json'))['version'])")
dmg_path="src-tauri/target/release/bundle/dmg/EchoPrism_${version}_aarch64.dmg"

echo
echo "== done =="
if [ -d "$app_path" ]; then
  echo "App bundle: $app_path"
else
  echo "no app bundle — build did not produce one" >&2
  exit 1
fi
if [ -f "$dmg_path" ]; then
  echo "Disk image: $dmg_path"
else
  echo "Disk image: (not built)"
fi
echo
echo "First launch (unsigned build): right-click EchoPrism.app → Open,"
echo "or: xattr -cr \"$app_path\""
