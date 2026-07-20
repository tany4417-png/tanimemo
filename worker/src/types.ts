export type NoteRecord = {
  id: string;
  body: string;
  tags: string[];
  importance: number;
  createdAt: number;
  updatedAt: number;
  deleted: 0 | 1;
  folderId: string | null;
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
};

export type SyncRequest = { since: number; notes: NoteRecord[]; attachments: AttachmentRecord[]; folders?: FolderRecord[] };
export type SyncResponse = { now: number; notes: NoteRecord[]; attachments: AttachmentRecord[]; folders: FolderRecord[]; purgedIds: string[] };
