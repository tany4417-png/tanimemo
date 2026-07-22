export type Note = {
  id: string;
  body: string;
  importance: 0 | 1 | 2 | 3;
  createdAt: number;
  updatedAt: number;
  deleted: 0 | 1;
  dirty: 0 | 1;
  folderId: string | null;
  // 手動並べ替え用の順序キー。null=未設定（旧データ・新規作成直後）。任意欄はfolderId導入前の既存Dexieレコードとの互換のため
  orderKey?: number | null;
  // リマインド予定時刻（epoch ms）。null=リマインド未設定/解除。repeatRuleと常にペアで送受信する
  remindAt: number | null;
  // 繰り返しルール（JSON文字列）。null=繰り返しなし
  repeatRule: string | null;
};

export type AttachmentMeta = {
  id: string;
  noteId: string;
  mime: string;
  size: number;
  createdAt: number;
  updatedAt: number;
  deleted: 0 | 1;
  dirty: 0 | 1;
};

export type Folder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
  deleted: 0 | 1;
  dirty: 0 | 1;
  orderKey?: number | null;
};

export type SyncResponse = {
  now: number;
  notes: Omit<Note, "dirty">[];
  attachments: Omit<AttachmentMeta, "dirty">[];
  folders?: Omit<Folder, "dirty">[];
  purgedIds?: string[];
};
