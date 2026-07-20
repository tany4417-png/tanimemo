CREATE TABLE purged (
  id TEXT PRIMARY KEY,
  purged_at INTEGER NOT NULL
);
CREATE INDEX idx_purged_at ON purged(purged_at);
