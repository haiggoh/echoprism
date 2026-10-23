#!/usr/bin/env bash
# Compare the local EchoPrism version against the latest GitHub release tag —
# the 4d update story for unsigned builds (they cannot self-update; you
# re-run scripts/build-from-source.sh instead).
#
# Usage:
#   ECHOPIRM_REPO=<owner/repo> scripts/check-updates.sh
#   scripts/check-updates.sh --repo <owner/repo>
#   scripts/check-updates.sh --help
#
# Exit codes: 0 = comparison made (up to date or update available),
# 1 = error (no repo given, network/HTTP failure, unparseable response).
set -euo pipefail

usage() {
  cat <<'EOF'
check-updates.sh — is my locally built EchoPrism behind the latest release?

Compares the version in src-tauri/tauri.conf.json with the latest release
tag on GitHub, and tells you what to do about it (re-run
scripts/build-from-source.sh). Unsigned builds cannot self-update — that is
why this script exists instead of an auto-updater.

Arguments:
  --repo <owner/repo>   the GitHub repo to query (e.g. haiggoh/echoprism)
  --help                show this message and exit

Environment:
  ECHOPIRM_REPO         the same value as --repo; --repo wins if both given
EOF
}

repo=""
while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --repo)
      [ $# -ge 2 ] || { echo "check-updates.sh: --repo needs a value" >&2; usage >&2; exit 2; }
      repo="$2"; shift 2 ;;
    *) echo "check-updates.sh: unknown argument '$1'" >&2; usage >&2; exit 2 ;;
  esac
done
# --repo wins; the documented ECHOPIRM_REPO env var is the fallback.
repo="${repo:-${ECHOPIRM_REPO:-}}"
[ -n "$repo" ] || { echo "check-updates.sh: no repo given (set ECHOPIRM_REPO or pass --repo)" >&2; usage >&2; exit 1; }

conf_dir="$(cd "$(dirname "$0")/.." && pwd)"
local_version=$(python3 -c "
import json
print(json.load(open('$conf_dir/src-tauri/tauri.conf.json'))['version'])
")

http=$(curl -sS -o /tmp/echoprism-latest-release.json -w "%{http_code}" --max-time 20 \
  "https://api.github.com/repos/$repo/releases/latest") || exit 1
if [ "$http" = "404" ]; then
  echo "no releases published at $repo yet — you are not behind anything."
  exit 0
fi
if [ "$http" != "200" ]; then
  echo "GitHub API returned HTTP $http for $repo" >&2
  exit 1
fi

latest=$(python3 -c "
import json
d = json.load(open('/tmp/echoprism-latest-release.json'))
print(d.get('tag_name', '').lstrip('v') or '')
")
[ -n "$latest" ] || { echo "could not read a tag_name from the response" >&2; exit 1; }

if [ "$local_version" = "$latest" ]; then
  echo "up to date: $local_version (latest release v$latest)"
else
  echo "update available: local $local_version → release $latest"
  echo "update by re-running: scripts/build-from-source.sh"
fi
