-- EchoPrism FTS5 Full-Text Search Setup

-- Create FTS5 virtual table for episodes
CREATE VIRTUAL TABLE IF NOT EXISTS episodes_fts USING fts5(
    title,
    description,
    content='episodes',
    content_rowid='rowid',
    tokenize='porter unicode61'
);

-- Trigger to keep FTS in sync with episodes table
CREATE TRIGGER IF NOT EXISTS episodes_ai AFTER INSERT ON episodes BEGIN
    INSERT INTO episodes_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
END;

CREATE TRIGGER IF NOT EXISTS episodes_ad AFTER DELETE ON episodes BEGIN
    INSERT INTO episodes_fts(episodes_fts, rowid, title, description) VALUES ('delete', old.rowid, old.title, old.description);
END;

CREATE TRIGGER IF NOT EXISTS episodes_au AFTER UPDATE ON episodes BEGIN
    INSERT INTO episodes_fts(episodes_fts, rowid, title, description) VALUES ('delete', old.rowid, old.title, old.description);
    INSERT INTO episodes_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
END;

-- Create FTS5 virtual table for channels
CREATE VIRTUAL TABLE IF NOT EXISTS channels_fts USING fts5(
    title,
    handle,
    description,
    content='channels',
    content_rowid='rowid',
    tokenize='porter unicode61'
);

-- Trigger to keep FTS in sync with channels table
CREATE TRIGGER IF NOT EXISTS channels_ai AFTER INSERT ON channels BEGIN
    INSERT INTO channels_fts(rowid, title, handle, description) VALUES (new.rowid, new.title, new.handle, new.description);
END;

CREATE TRIGGER IF NOT EXISTS channels_ad AFTER DELETE ON channels BEGIN
    INSERT INTO channels_fts(channels_fts, rowid, title, handle, description) VALUES ('delete', old.rowid, old.title, old.handle, old.description);
END;

CREATE TRIGGER IF NOT EXISTS channels_au AFTER UPDATE ON channels BEGIN
    INSERT INTO channels_fts(channels_fts, rowid, title, handle, description) VALUES ('delete', old.rowid, old.title, old.handle, old.description);
    INSERT INTO channels_fts(rowid, title, handle, description) VALUES (new.rowid, new.title, new.handle, new.description);
END;

-- Create FTS5 virtual table for podcast feeds
CREATE VIRTUAL TABLE IF NOT EXISTS podcast_feeds_fts USING fts5(
    title,
    description,
    author,
    content='podcast_feeds',
    content_rowid='rowid',
    tokenize='porter unicode61'
);

-- Trigger to keep FTS in sync with podcast_feeds table
CREATE TRIGGER IF NOT EXISTS podcast_feeds_ai AFTER INSERT ON podcast_feeds BEGIN
    INSERT INTO podcast_feeds_fts(rowid, title, description, author) VALUES (new.rowid, new.title, new.description, new.author);
END;

CREATE TRIGGER IF NOT EXISTS podcast_feeds_ad AFTER DELETE ON podcast_feeds BEGIN
    INSERT INTO podcast_feeds_fts(podcast_feeds_fts, rowid, title, description, author) VALUES ('delete', old.rowid, old.title, old.description, old.author);
END;

CREATE TRIGGER IF NOT EXISTS podcast_feeds_au AFTER UPDATE ON podcast_feeds BEGIN
    INSERT INTO podcast_feeds_fts(podcast_feeds_fts, rowid, title, description, author) VALUES ('delete', old.rowid, old.title, old.description, old.author);
    INSERT INTO podcast_feeds_fts(rowid, title, description, author) VALUES (new.rowid, new.title, new.description, new.author);
END;

-- Optimize FTS tables
-- Note: In production, you'd run these periodically or after bulk inserts
-- INSERT INTO episodes_fts(episodes_fts) VALUES ('optimize');
-- INSERT INTO channels_fts(channels_fts) VALUES ('optimize');
-- INSERT INTO podcast_feeds_fts(podcast_feeds_fts) VALUES ('optimize');