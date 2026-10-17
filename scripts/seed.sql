-- EchoPrism seed data (P3 phase 3, docs/plans/2026-10-18-p3-test-infrastructure.md).
-- Applied by scripts/seed.mjs AFTER the schema files. Idempotent: every INSERT
-- is INSERT OR IGNORE with explicit ids.
--
-- PARALLEL SURFACE: ids/titles mirror src/mocks/data.ts (the browser fixture
-- DB) so e2e specs and a real-shell click-through exercise the same data.
-- They need not be byte-identical, but the binding decisions must agree:
--   D1: auto_download_wifi stays at the schema default (0) — queue-add never
--       implies download; the preference row below inserts NO overrides.
--   D2: card_click_action stays at the schema default ('auto').
-- Both defaults are asserted by src/__tests__/seed-script.test.ts.

PRAGMA foreign_keys = ON;

-- Owner user (the app's backend assumes a single local user).
INSERT OR IGNORE INTO users (id) VALUES ('current-user');

-- One healthy Invidious instance for the pool.
INSERT OR IGNORE INTO instances (id, url, type, health, latency_ms, supports_sabr, supports_age_restricted)
VALUES ('inst-1', 'https://invidious.example.dev', 'invidious', 'healthy', 87, 0, 0);

-- Channels: one video (YouTube), one podcast (RSS). Same fixtures as the mock.
INSERT OR IGNORE INTO channels (id, user_id, external_id, title, is_subscribed, notifications_enabled, type, podcast_feed_url)
VALUES
    ('ch-1', 'current-user', 'UC-mock-tech-talks', 'Tech Talks Weekly', 1, 0, 'video', NULL),
    ('ch-2', 'current-user', 'https://feeds.example.org/deep-dive.xml', 'The Deep Dive Podcast', 1, 0, 'podcast', 'https://feeds.example.org/deep-dive.xml');

-- Episodes: 2 video + 2 podcast. ep-video-2 carries progress_seconds=120 —
-- the D3 position-restore fixture. audio_url mirrors the mock (a public/
-- path is only meaningful in the browser world; the real backend resolves
-- streams via stream_episode, never from this column).
INSERT OR IGNORE INTO episodes (id, channel_id, external_id, title, video_id, podcast_guid, audio_url, duration_seconds, published_at, progress_seconds, is_downloaded)
VALUES
    ('ep-video-1', 'ch-1', 'dQw4w9WgXcQ', 'video: How Invidious pools actually work', 'dQw4w9WgXcQ', NULL, NULL, 613, '2026-10-10T00:00:00Z', 0, 0),
    ('ep-video-2', 'ch-1', 'aqz-KE-bpKQ', 'video: Big Buck Bunny, explained frame by frame', 'aqz-KE-bpKQ', NULL, NULL, 635, '2026-10-12T00:00:00Z', 120, 0),
    ('ep-pod-1', 'ch-2', 'deep-dive-042', 'podcast: Episode 42 — RSS is winning again', NULL, 'deep-dive-042', '/mock-media/ep-pod-1.wav', 3180, '2026-10-14T00:00:00Z', 0, 0),
    ('ep-pod-2', 'ch-2', 'deep-dive-041', 'podcast: Episode 41 — The instance reliability problem', NULL, 'deep-dive-041', '/mock-media/ep-pod-2.wav', 2940, '2026-10-07T00:00:00Z', 0, 0);

-- One confirmed-confidence smart link (F07 demo data).
INSERT OR IGNORE INTO episode_links (id, podcast_guid, youtube_video_id, confidence, matched_at, matched_by)
VALUES ('link-1', 'deep-dive-042', 'dQw4w9WgXcQ', 0.92, '2026-10-16T03:00:00Z', 'auto');

-- Preferences: inserts ONLY the user id — every preference keeps its schema
-- default, which is where D1/D2 live. default_instance_id points at the
-- seeded instance to exercise the FK.
INSERT OR IGNORE INTO user_preferences (user_id, default_instance_id)
VALUES ('current-user', 'inst-1');
