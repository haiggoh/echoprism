# Cold-path findings — 2026-11-15 (Task 8, streaming-startup)

All numbers measured on this machine with `yt-dlp --force-ipv4` (IPv6 to
YouTube is blackholed here; bare runs take 183 s). 27 yt-dlp runs used of the
≤ 30/h bot-block budget. Scratch script: /tmp/ep-coldpath-measure.sh (outside
the repo, --help supported).

## Extraction time per player-client config (yt-dlp -J, 2026.10.26)

| video | default | mediaconnect | tv | web_safari | ios | tv+skip webpage | mediaconnect+skip webpage | tv_embedded | mediaconnect+skip configs | web |
|---|---|---|---|---|---|---|---|---|---|---|
| 9bZkp7q19f0 | 5.07 s, 45 fmts, audio ✓ hls ✓ | 4.00 s, 45 fmts, audio ✓ hls ✓ | fail | fail | fail | fail | — | — | — | — |
| jNQXAC9IVRw | 2.53 s, 25 fmts, audio ✓ hls ✓ | 2.18 s, 25 fmts, audio ✓ hls ✓ | reload-err | reload-err | reload-err | reload-err | 2.45 s, 25 fmts ✓✓ | 4.09 s ✓✓ | reload-err | 1.34 s, 0 fmts |
| kJQP7kiw5Fk | 2.54 s, 44 fmts, audio ✓ hls ✓ | 3.04 s, 44 fmts, audio ✓ hls ✓ | fail | fail | fail | fail | — | — | — | — |

Errors: "The page needs to be reloaded" (tv-family without webpage),
"Sign in to confirm you're not a bot" (player_skip=webpage with default
clients), "No video formats found" (web alone), android → only 1 format.

**Decision: `player_client=mediaconnect`** — the fastest client set that
keeps BOTH audio-only (m4a/opus) and HLS (m3u8_native) formats on all three
videos. Applied as one `YT_DLP_EXTRACTOR_ARGS` constant to every `-J`
invocation (resolve, refresh, storyboard).

## HLS lock test (the §2.8 question: does HLS escape the available_at gate?)

**YES.** Master playlist: 200 at ttfb 0.14 s immediately after extraction.
Variant playlist: 200 at every 300 ms poll (ttfb 0.11–0.13 s). Segment:
200 (ttfb 0.08–0.25 s). No request headers required (200 without the
format's User-Agent). Variant/segment URLs in the master are ABSOLUTE
(manifest.googlevideo.com / rr*.googlevideo.com), not relative.

Consequence: a cold VIDEO click that resolves to the HLS master skips the
`available_at` gate entirely — cold video ≈ extraction + ~0.2 s.

## Cold-start budget after Tasks 3+8 (measured stages)

- extract (mediaconnect): 2.2–4.0 s in the matrix; live resolve path measured
  2.5 s (audio) and 6.1 s (video, outlier run) for tuN5h65fhBk
- gate poll (Task 3): ~2.5 s for progressive (audio) URLs; ~0 for HLS
- probe: ~0.4 s
- video via HLS: ≈ 2.4–4.2 s total → within the ≤ 5 s HARD target
- audio (progressive, gated): ≈ 5.1–6.9 s — borderline over; see Task 9
  (audio-only HLS rung would skip the gate too)

## Task 9 Step 0 prototype (REPORT BACK rule, resolved 2026-11-15): WebKit HLS variant choice vs element size

Real WKWebView probe (system Swift 6.4 + WKWebView, offscreen window; variant
URLs of a live master rewritten through a logging local server so the chosen
itag is observable; masters served with variants up to 1080p):

- video element 640×360, master up to 1080p → requested variants 144p, 240p,
  360p, 480p ONLY (no 720p/1080p fetch)
- video element 1920×1080, master up to 240p → 240p (nothing higher existed)

**Result: the hypothesis HOLDS — WebKit's HLS player limits variants to
roughly the element's pixel size.** Per the plan: serve ONE master filtered
to the FULLSCREEN cap; windowed limiting is natural and leaving fullscreen
steps down gradually on its own. No fullscreen swap, no hls.js.

## Live cold measurement through the real resolve path (Task 8 step 4, IPv4)

`live_round6_youtube_resolves_to_streamable_media` (tuN5h65fhBk), mediaconnect:

| mode | ytdlp_ms | gate_ms | probe_ms | total resolve |
|---|---|---|---|---|
| video (progressive 18 — pre-Task-9 path) | 6124 | 3601 | 954 | ≈ 10.7 s — MISSES ≤ 5 s |
| audio (progressive, gated) | 2509 | 3486 | 980 | ≈ 7.0 s — MISSES ≤ 5 s |

Task 9 switches video to the ungated HLS master (video ≈ extract + 0.2 s ≈
2.4–6.3 s depending on extraction variance). Audio stays on gated progressive
formats ≈ 7 s unless an audio-only HLS rung is used. Remaining options if the
hard target is still missed: persistent extractor process (NOT built —
owner-gated), audio-only HLS rung, pre-warm on app start. Waypoint added:
`echoprism: cold start still > 5 s — options in cold-path-findings.md`.
