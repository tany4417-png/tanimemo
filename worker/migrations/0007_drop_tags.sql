-- タグ機能全削除（2026-07-21 オーナー指示）。実データはタグ付き0件を確認済み。
-- tags列は無インデックス・無制約参照のためDROP可能
ALTER TABLE notes DROP COLUMN tags;
