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
-- ch-3/ch-4 are the D6/D7 canonical two-stream show (owner example).
INSERT OR IGNORE INTO channels (id, user_id, external_id, title, is_subscribed, notifications_enabled, type, podcast_feed_url)
VALUES
    ('ch-1', 'current-user', 'UC-mock-tech-talks', 'Tech Talks Weekly', 1, 0, 'video', NULL),
    ('ch-2', 'current-user', 'https://feeds.example.org/deep-dive.xml', 'The Deep Dive Podcast', 1, 0, 'podcast', 'https://feeds.example.org/deep-dive.xml'),
    ('ch-3', 'current-user', 'UC-mock-some-more-news', 'Some More News', 1, 0, 'video', NULL),
    ('ch-4', 'current-user', 'https://feeds.example.org/even-more-news.xml', 'Even More News', 1, 0, 'podcast', 'https://feeds.example.org/even-more-news.xml');

-- Episodes: 2 video + 2 podcast. ep-video-2 carries progress_seconds=120 —
-- the D3 position-restore fixture. audio_url mirrors the mock (a public/
-- path is only meaningful in the browser world; the real backend resolves
-- streams via stream_episode, never from this column).
-- ep-smn-*/ep-emn-* are the D6 two-stream show: same stories, YouTube-native
-- titles on ch-3, podcast-native titles on ch-4, every episode on both.
INSERT OR IGNORE INTO episodes (id, channel_id, external_id, title, video_id, podcast_guid, audio_url, duration_seconds, published_at, progress_seconds, is_downloaded)
VALUES
    ('ep-video-1', 'ch-1', 'dQw4w9WgXcQ', 'video: How Invidious pools actually work', 'dQw4w9WgXcQ', NULL, NULL, 613, '2026-10-10T00:00:00Z', 0, 0),
    ('ep-video-2', 'ch-1', 'aqz-KE-bpKQ', 'video: Big Buck Bunny, explained frame by frame', 'aqz-KE-bpKQ', NULL, NULL, 635, '2026-10-12T00:00:00Z', 120, 0),
    ('ep-pod-1', 'ch-2', 'deep-dive-042', 'podcast: Episode 42 — RSS is winning again', NULL, 'deep-dive-042', '/mock-media/ep-pod-1.wav', 3180, '2026-10-14T00:00:00Z', 0, 0),
    ('ep-pod-2', 'ch-2', 'deep-dive-041', 'podcast: Episode 41 — The instance reliability problem', NULL, 'deep-dive-041', '/mock-media/ep-pod-2.wav', 2940, '2026-10-07T00:00:00Z', 0, 0),
    ('ep-smn-1', 'ch-3', 'smn-vid-001', 'Some More News: Why Billionaires Should Not Exist', 'smn-vid-001', NULL, NULL, 2040, '2026-10-15T00:00:00Z', 0, 0),
    ('ep-smn-2', 'ch-3', 'smn-vid-002', 'Some More News: The Housing Crisis Is Not an Accident', 'smn-vid-002', NULL, NULL, 2160, '2026-10-08T00:00:00Z', 0, 0),
    ('ep-emn-1', 'ch-4', 'emn-guid-001', 'Even More News: Why Billionaires Should Not Exist', NULL, 'emn-guid-001', '/mock-media/ep-emn-1.wav', 2220, '2026-10-15T00:00:00Z', 0, 0),
    ('ep-emn-2', 'ch-4', 'emn-guid-002', 'Even More News: The Housing Crisis Is Not an Accident', NULL, 'emn-guid-002', '/mock-media/ep-emn-2.wav', 2340, '2026-10-08T00:00:00Z', 0, 0);

-- One confirmed-confidence smart link (F07 demo data), plus the two-stream
-- show's links (D6): each story paired across the two families.
INSERT OR IGNORE INTO episode_links (id, podcast_guid, youtube_video_id, confidence, matched_at, matched_by)
VALUES
    ('link-1', 'deep-dive-042', 'dQw4w9WgXcQ', 0.92, '2026-10-16T03:00:00Z', 'auto'),
    ('link-2', 'emn-guid-001', 'smn-vid-001', 0.97, '2026-10-17T03:00:00Z', 'auto'),
    ('link-3', 'emn-guid-002', 'smn-vid-002', 0.96, '2026-10-17T03:00:00Z', 'auto');

-- D7 play-mode rules (owner example verbatim): the YouTube-native family
-- defaults to video, the podcast-native family to audio.
INSERT OR IGNORE INTO play_mode_rules (id, channel_id, title_pattern, play_mode, priority, created_at, updated_at)
VALUES
    ('rule-1', 'ch-3', 'Some More News', 'video', 0, '2026-10-18T00:00:00Z', '2026-10-18T00:00:00Z'),
    ('rule-2', 'ch-4', 'Even More News', 'audio', 0, '2026-10-18T00:00:00Z', '2026-10-18T00:00:00Z');

-- Preferences: inserts ONLY the user id — every preference keeps its schema
-- default, which is where D1/D2 live. default_instance_id points at the
-- seeded instance to exercise the FK.
INSERT OR IGNORE INTO user_preferences (user_id, default_instance_id)
VALUES ('current-user', 'inst-1');
