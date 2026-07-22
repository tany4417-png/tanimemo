-- リマインダー: notesに設定列（同期対象）、スケジュール/購読/再送はサーバー専用
ALTER TABLE notes ADD COLUMN remind_at INTEGER;
ALTER TABLE notes ADD COLUMN repeat_rule TEXT;

CREATE TABLE reminders (
  note_id TEXT PRIMARY KEY,
  next_fire_at INTEGER NOT NULL
);
CREATE INDEX idx_reminders_fire ON reminders(next_fire_at);

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  device_label TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  failed_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE push_retries (
  note_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (note_id, subscription_id)
);
