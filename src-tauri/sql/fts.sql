-- Full-text search virtual tables for EchoPrism

-- Episode full-text search using FTS5
CREATE VIRTUAL TABLE IF NOT EXISTS episodes_fts USING fts5(
    title, description, channel_id,
    content='episodes', content_rowid='rowid'
);

-- Trigger to keep FTS in sync with episodes table
CREATE TRIGGER IF NOT EXISTS episodes_ai AFTER INSERT ON episodes BEGIN
    INSERT INTO episodes_fts(rowid, title, description, channel_id) VALUES (new.rowid, new.title, new.description, new.channel_id);
END;

CREATE TRIGGER IF NOT EXISTS episodes_ad AFTER DELETE ON episodes BEGIN
    INSERT INTO episodes_fts(episodes_fts, rowid, title, description, channel_id) VALUES ('delete', old.rowid, old.title, old.description, old.channel_id);
END;

CREATE TRIGGER IF NOT EXISTS episodes_au AFTER UPDATE ON episodes BEGIN
    INSERT INTO episodes_fts(episodes_fts, rowid, title, description, channel_id) VALUES ('delete', old.rowid, old.title, old.description, old.channel_id);
    INSERT INTO episodes_fts(rowid, title, description, channel_id) VALUES (new.rowid, new.title, new.description, new.channel_id);
END;

-- Channel full-text search (optional, for searching channels by title/description)
CREATE VIRTUAL TABLE IF NOT EXISTS channels_fts USING fts5(
    title, description, handle,
    content='channels', content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS channels_ai AFTER INSERT ON channels BEGIN
    INSERT INTO channels_fts(rowid, title, description, handle) VALUES (new.rowid, new.title, new.description, new.handle);
END;

CREATE TRIGGER IF NOT EXISTS channels_ad AFTER DELETE ON channels BEGIN
    INSERT INTO channels_fts(channels_fts, rowid, title, description, handle) VALUES ('delete', old.rowid, old.title, old.description, old.handle);
END;

CREATE TRIGGER IF NOT EXISTS channels_au AFTER UPDATE ON channels BEGIN
    INSERT INTO channels_fts(channels_fts, rowid, title, description, handle) VALUES ('delete', old.rowid, old.title, old.description, old.handle);
    INSERT INTO channels_fts(rowid, title, description, handle) VALUES (new.rowid, new.title, new.description, new.handle);
END;
