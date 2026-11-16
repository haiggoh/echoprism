# e2e HLS fixtures (Task 1 — docs/plans/2026-11-16-followups-plan.md)

Tiny committed HLS VOD streamed by `e2e/hls.spec.ts` (webkit project), plus a
1-second progressive mp4 used as the fallback stream.

- `master.m3u8` — master playlist listing two variants (320x180, 640x360)
- `v180/`, `v360/` — the variants: 4 s of `testsrc2`, 2 s mpegts segments,
  h264 video + silent aac audio
- `fallback.mp4` — 1 s progressive h264 mp4 (`+faststart`)

**Serving:** served by the DEV-ONLY `/test-media` middleware in
`vite.config.ts` (`apply: 'serve'` — `vite build` never runs it, so no fixture
byte can reach `dist/`). Do NOT move these into `public/`: `public/` is copied
into the production bundle verbatim.

**Regenerate from the repo root** (run inside `e2e/fixtures/hls`):

```bash
/opt/homebrew/bin/ffmpeg -y -loglevel error \
  -f lavfi -i testsrc2=size=320x180:rate=15:duration=4 \
  -f lavfi -i anullsrc=r=22050:cl=mono -shortest \
  -c:v libx264 -profile:v baseline -level 3.0 -pix_fmt yuv420p -b:v 80k -g 30 \
  -c:a aac -b:a 16k -ac 1 \
  -f hls -hls_time 2 -hls_playlist_type vod -hls_segment_type mpegts \
  -hls_segment_filename 'v180/seg%d.ts' v180/playlist.m3u8

/opt/homebrew/bin/ffmpeg -y -loglevel error \
  -f lavfi -i testsrc2=size=640x360:rate=15:duration=4 \
  -f lavfi -i anullsrc=r=22050:cl=mono -shortest \
  -c:v libx264 -profile:v main -level 3.1 -pix_fmt yuv420p -b:v 200k -g 30 \
  -c:a aac -b:a 16k -ac 1 \
  -f hls -hls_time 2 -hls_playlist_type vod -hls_segment_type mpegts \
  -hls_segment_filename 'v360/seg%d.ts' v360/playlist.m3u8

/opt/homebrew/bin/ffmpeg -y -loglevel error \
  -f lavfi -i testsrc2=size=640x360:rate=15:duration=1 \
  -f lavfi -i anullsrc=r=22050:cl=mono -shortest \
  -c:v libx264 -profile:v main -pix_fmt yuv420p -b:v 200k -movflags +faststart \
  -c:a aac -b:a 16k -ac 1 fallback.mp4

# Task 2a audio-only rendition (§10 A): aac-only media playlist + m4a fallback
/opt/homebrew/bin/ffmpeg -y -loglevel error -f lavfi -i anullsrc=r=22050:cl=mono -t 4 \
  -c:a aac -b:a 16k -ac 1 -f hls -hls_time 2 -hls_playlist_type vod -hls_segment_type mpegts \
  -hls_segment_filename 'audio/seg%d.ts' audio/media.m3u8

/opt/homebrew/bin/ffmpeg -y -loglevel error -f lavfi -i anullsrc=r=22050:cl=mono -t 1 \
  -c:a aac -b:a 16k -ac 1 -movflags +faststart audio-fallback.m4a
```

`master.m3u8` is hand-written (two `#EXT-X-STREAM-INF` rungs) so the variant
set stays stable across ffmpeg versions. The CODECS strings were derived from
the ffprobe profiles of the generated segments (Constrained Baseline 3.0 →
`avc1.42C01E`, Main 3.1 → `avc1.4D401F`, AAC-LC → `mp4a.40.2`); the WebKit
specs prove the master actually plays, so a wrong string surfaces as a red
test, not a silent skip.
