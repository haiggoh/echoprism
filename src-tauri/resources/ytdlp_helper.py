#!/usr/bin/env python3
"""EchoPrism persistent yt-dlp extractor helper (Task 2b — docs/plans/2026-11-16-followups-plan.md, root cause §10 B).

WHY: every one-shot `yt-dlp -J` spawn pays 10-30 s of process start-up on this
machine (first stderr line at 15.9 s; warm in-process extraction is 1.5-2.4 s).
This helper keeps ONE Python process alive for the app's lifetime, imports
yt_dlp ONCE at start-up (that import IS the pre-warm), and answers one JSON
request per stdin line.

PROTOCOL (line-delimited JSON on stdin/stdout):
  request:  {"id": <int>, "video_id": "<youtube id>", "force_ipv4": <bool>}
  response: {"id": <int>, "ok": true,  "info": <extract_info dict, sanitized>}
            {"id": <int>, "ok": false, "error": "<message>"}
  stderr:   yt-dlp warnings/errors (the app forwards them to its log at WARN;
            nothing is suppressed — Task 2c removed --no-warnings).

The app spawns this with the SAME interpreter as the yt-dlp binary's shebang
(resolved by the Rust side), starts it at app launch, restarts it on crash,
kills it with the app, and times each request out (30 s default). On ANY
helper failure the app falls back to the one-shot `yt-dlp -J`.

Env: EP_HELPER_SOCKET_TIMEOUT (seconds, default 15) — per-socket timeout inside
yt-dlp, NOT the request timeout the app enforces.
"""
import json
import os
import sys


def main() -> int:
    if "--help" in sys.argv or "-h" in sys.argv:
        # --help must work anywhere, even where yt_dlp is not importable.
        print(__doc__)
        return 0
    import yt_dlp  # noqa: PLC0415 — imported ONCE here: this import is the pre-warm

    socket_timeout = int(os.environ.get("EP_HELPER_SOCKET_TIMEOUT", "15"))
    while True:
        line = sys.stdin.readline()
        if not line:
            return 0  # the app closed the pipe: exit with it
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception as e:  # noqa: BLE001 — protocol errors must not kill the helper
            print(json.dumps({"id": None, "ok": False, "error": f"bad request line: {e}"}), flush=True)
            continue
        rid = req.get("id")
        video_id = str(req.get("video_id") or "")
        force_ipv4 = bool(req.get("force_ipv4"))
        if not video_id:
            print(json.dumps({"id": rid, "ok": False, "error": "video_id is required"}), flush=True)
            continue
        params = {
            "skip_download": True,
            # quiet keeps yt-dlp's INFO lines off STDOUT (the protocol channel);
            # warnings still go to stderr -> app log (no_warnings stays False).
            "quiet": True,
            "noprogress": True,
            "no_warnings": False,
            "socket_timeout": socket_timeout,
        }
        if force_ipv4:
            params["source_address"] = "0.0.0.0"
        try:
            with yt_dlp.YoutubeDL(params) as ydl:
                info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
                info = ydl.sanitize_info(info)
            print(json.dumps({"id": rid, "ok": True, "info": info}), flush=True)
        except Exception as e:  # noqa: BLE001 — one bad video must not kill the helper
            print(json.dumps({"id": rid, "ok": False, "error": str(e)}), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
