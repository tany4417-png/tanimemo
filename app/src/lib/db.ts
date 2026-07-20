import Dexie, { type Table } from "dexie";
import type { AttachmentMeta, Folder, Note } from "./types";

export type AttachmentBlobRow = { id: string; blob: Blob };
export type MetaRow = { key: string; value: number | string };

export class TanimemoDB extends Dexie {
  notes!: Table<Note, string>;
  attachments!: Table<AttachmentMeta, string>;
  attachmentBlobs!: Table<AttachmentBlobRow, string>;
  meta!: Table<MetaRow, string>;
  folders!: Table<Folder, string>;

  constructor() {
    super("tanimemo");
    this.version(1).stores({
      notes: "id, updatedAt, createdAt, importance, dirty",
      attachments: "id, noteId, updatedAt, dirty",
      attachmentBlobs: "id",
      meta: "key",
    });
    this.version(2)
      .stores({
        notes: "id, updatedAt, createdAt, importance, dirty, folderId",
        attachments: "id, noteId, updatedAt, dirty",
        attachmentBlobs: "id",
        meta: "key",
        folders: "id, parentId, updatedAt, dirty",
      })
      .upgrade(async (tx) => {
        await tx.table("notes").toCollection().modify({ folderId: null });
      });
  }
}

export const db = new TanimemoDB();

export async function resetDbForTests(): Promise<void> {
  await Promise.all(db.tables.map((t) => t.clear()));
}
