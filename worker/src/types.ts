export type NoteRecord = {
  id: string;
  body: string;
  importance: number;
  createdAt: number;
  updatedAt: number;
  deleted: 0 | 1;
  // 旧クライアントはこのフィールド自体を送らないことがある（upsertNoteはその場合folder_idを現状維持する）
  folderId?: string | null;
  // 旧クライアントはこのフィールド自体を送らないことがある（upsertNoteはその場合order_keyを現状維持する）
  orderKey?: number | null;
  /** リマインダー基準日時(epoch ms)。null=なし。旧クライアントはフィールド自体を送らない */
  remindAt?: number | null;
  /** 繰り返しルールJSON。remindAtと常にペアで送る */
  repeatRule?: string | null;
  // 旧クライアント互換シム: タグ機能は削除済み（migration 0007）だが、SW更新前の旧クライアントが
  // pull応答のtags欠落で描画クラッシュしないよう、応答にのみ空配列を付けて返す（push側は一切読まない）。
  // 両端末の更新確認後に撤去する
  tags?: string[];
};

export type AttachmentRecord = {
  id: string;
  noteId: string;
  mime: string;
  size: number;
  createdAt: number;
  updatedAt: number;
  deleted: 0 | 1;
};

export type FolderRecord = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
  deleted: 0 | 1;
  // 旧クライアントはこのフィールド自体を送らないことがある（upsertFolderはその場合order_keyを現状維持する）
  orderKey?: number | null;
};

export type SyncRequest = { since: number; notes: NoteRecord[]; attachments: AttachmentRecord[]; folders?: FolderRecord[] };
export type SyncResponse = { now: number; notes: NoteRecord[]; attachments: AttachmentRecord[]; folders: FolderRecord[]; purgedIds: string[] };
