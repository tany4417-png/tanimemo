ALTER TABLE notes ADD COLUMN received_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE attachments ADD COLUMN received_at INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_notes_received ON notes(received_at);
CREATE INDEX idx_att_received ON attachments(received_at);
UPDATE notes SET received_at = updated_at WHERE received_at = 0;
UPDATE attachments SET received_at = updated_at WHERE received_at = 0;
