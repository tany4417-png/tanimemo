export type NoteRecord = {
  id: string;
  body: string;
  tags: string[];
  importance: number;
  createdAt: number;
  updatedAt: number;
  deleted: 0 | 1;
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

export type SyncRequest = { since: number; notes: NoteRecord[]; attachments: AttachmentRecord[] };
export type SyncResponse = { now: number; notes: NoteRecord[]; attachments: AttachmentRecord[] };
