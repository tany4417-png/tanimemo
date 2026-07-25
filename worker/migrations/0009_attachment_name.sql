-- 添付に元のファイル名を持たせる（PDF等の非画像を扱うため）。既存行はNULL＝クライアント側で表示名を生成する
ALTER TABLE attachments ADD COLUMN name TEXT;
