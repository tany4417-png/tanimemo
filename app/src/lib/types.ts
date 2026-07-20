export type Note = {
  id: string;
  body: string;
  tags: string[];
  importance: 0 | 1 | 2 | 3;
  createdAt: number;
  updatedAt: number;
  deleted: 0 | 1;
  dirty: 0 | 1;
  folderId: string | null;
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
};

export type SyncResponse = {
  now: number;
  notes: Omit<Note, "dirty">[];
  attachments: Omit<AttachmentMeta, "dirty">[];
  folders?: Omit<Folder, "dirty">[];
  purgedIds?: string[];
};
