CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  received_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_folders_updated ON folders(updated_at);
CREATE INDEX idx_folders_received ON folders(received_at);

ALTER TABLE notes ADD COLUMN folder_id TEXT;
