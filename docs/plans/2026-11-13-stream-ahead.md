# Stream-ahead: killing the >10s playback start (echoprism-initial-playback)

- **Date:** 2026-11-13 (round 9, Track B)
- **Status:** PROPOSED — the measured chain is fact; the options below need an owner
  look before the bigger ones are built. Option 0 is already shipped in this round.
- **Owner want (2026-11-06, reconfirmed 2026-11-13):** "stream-ahead buffering, not
  load-before-play" — playback should start as soon as anything playable exists.

## The measured chain (owner dev-run log, 2026-11-13, v0.1.14 dev)

Every play currently pays, in order:

1. **Instance resolve fails** — `resolve_stream(...): all 2 instance(s) failed — falling
   back to yt-dlp` on EVERY resolve in the log. Both seeded instances are unhealthy, but
   every resolve still spends their probe/timeout budget first.
2. **yt-dlp -J** — the full JSON dump for the video (seconds; network-bound).
3. **`available_at` wait** — `yt-dlp format not available yet; waiting 2.6–5.6s` on most
   resolves. Physics: googlevideo 403s a URL until its `available_at`; the round-6 fix
   waits it out. Not skippable, but it STACKS with (1) and (2).
4. **1-byte probe per candidate** (10s client timeout each) — the first probed candidate
   usually wins (`candidate OK ... 206`), but a 403'd candidate moves to the next one,
   each with its own (3).
5. **DB pool starvation** — `pool timed out while waiting for an open connection`:
   the outright-failure mode. FIXED this round (max_connections 5→10 + WAL, commit
   `da4cfef7`): reads no longer starve behind the per-keystroke search load.

Net: >10s is the NORM while both instances are unhealthy; "fails outright" was (5).

## Options

### 0. Instance short-circuit (backend, small, no owner trade-off) — DO FIRST
The instance pool already tracks health. When every seeded instance is unhealthy
(recent fail), skip stage (1) entirely and go straight to yt-dlp. Saves the per-resolve
instance budget with zero user-visible change. A unit test pins it: with all instances
marked unhealthy, `resolve_stream` must not attempt them.

### 1. Hover prefetch (frontend, medium) — the owner's literal "stream-ahead"
Resolve on pointer-hover with a dwell threshold (~400ms) so incidental passes don't
trigger yt-dlp; cache `{episode_id, format} → StreamInfo` (TTL ≈ the URL's real
lifetime — googlevideo URLs die early, so a fresh resolve on click must override a stale
cache). Click then starts from a warm resolve: near-zero wait. Cost: one yt-dlp run per
dwell-hover — bounded by the dwell + a per-episode in-flight dedupe.

### 2. Queue pre-roll (backend+frontend, medium)
While an episode plays, resolve the NEXT queue item in the background. Queue advance
then starts instantly. Same cache discipline as (1); lower churn (one prefetch per
track, not per hover).

### 3. Not this round
- Skipping `available_at` (physics — the round-6 403 root cause).
- A resolver-side "start on first byte" split of `stream_episode` (deeper surgery; revisit
  if (0)–(2) don't get starts under ~3s).

## Receipts this round

- Pool starvation fixed: `da4cfef7` (+2 tests, 193/193).
- Seek-stall recovery shipped: `1e9ac7d7` — an errored element now re-resolves and
  re-applies the position instead of stranding behind a toast (the "sometimes fails and
  never comes back" half).
