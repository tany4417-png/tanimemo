import { ulid } from "ulid";
import { db } from "./db";
import { thumbKey } from "./attachments";
import type { Note } from "./types";

export type NotePatch = Partial<Pick<Note, "body" | "tags" | "importance" | "deleted" | "folderId" | "orderKey">>;

export async function createNote(body = "", tags: string[] = [], folderId: string | null = null): Promise<Note> {
  const now = Date.now();
  const n: Note = { id: ulid(), body, tags, importance: 0, createdAt: now, updatedAt: now, deleted: 0, dirty: 1, folderId, orderKey: null };
  await db.notes.put(n);
  return n;
}

export async function updateNote(id: string, patch: NotePatch): Promise<Note> {
  const cur = await db.notes.get(id);
  if (!cur) throw new Error(`note not found: ${id}`);
  const next: Note = { ...cur, ...patch, updatedAt: Date.now(), dirty: 1 };
  await db.notes.put(next);
  return next;
}

export async function softDeleteNote(id: string): Promise<Note> {
  return updateNote(id, { deleted: 1 });
}

export async function listActiveNotes(): Promise<Note[]> {
  return (await db.notes.toArray()).filter((n) => n.deleted === 0);
}

export function allTags(notes: Note[]): string[] {
  return [...new Set(notes.flatMap((n) => n.tags))].sort();
}

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export async function listTrashedNotes(): Promise<Note[]> {
  return (await db.notes.toArray()).filter((n) => n.deleted === 1).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function restoreNote(id: string): Promise<Note> {
  return updateNote(id, { deleted: 0 });
}

export async function purgeExpiredTrashLocal(now = Date.now()): Promise<number> {
  const cutoff = now - TRASH_RETENTION_MS;
  const expired = (await db.notes.toArray()).filter((n) => n.deleted === 1 && n.updatedAt < cutoff);
  const expiredFolders = (await db.folders.toArray()).filter((f) => f.deleted === 1 && f.updatedAt < cutoff);
  if (expired.length === 0 && expiredFolders.length === 0) return 0;
  const ids = new Set(expired.map((n) => n.id));
  const atts = (await db.attachments.toArray()).filter((a) => ids.has(a.noteId));
  const folderIds = expiredFolders.map((f) => f.id);
  await db.transaction("rw", db.notes, db.attachments, db.attachmentBlobs, db.folders, async () => {
    await db.notes.bulkDelete([...ids]);
    await db.attachments.bulkDelete(atts.map((a) => a.id));
    await db.attachmentBlobs.bulkDelete(atts.flatMap((a) => [a.id, thumbKey(a.id)]));
    await db.folders.bulkDelete(folderIds);
  });
  return expired.length + expiredFolders.length;
}
