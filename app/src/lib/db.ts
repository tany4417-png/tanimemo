import Dexie, { type Table } from "dexie";
import type { AttachmentMeta, Note } from "./types";

export type AttachmentBlobRow = { id: string; blob: Blob };
export type MetaRow = { key: string; value: number | string };

export class TanimemoDB extends Dexie {
  notes!: Table<Note, string>;
  attachments!: Table<AttachmentMeta, string>;
  attachmentBlobs!: Table<AttachmentBlobRow, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super("tanimemo");
    this.version(1).stores({
      notes: "id, updatedAt, createdAt, importance, dirty",
      attachments: "id, noteId, updatedAt, dirty",
      attachmentBlobs: "id",
      meta: "key",
    });
  }
}

export const db = new TanimemoDB();

export async function resetDbForTests(): Promise<void> {
  await Promise.all(db.tables.map((t) => t.clear()));
}
