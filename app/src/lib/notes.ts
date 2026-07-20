import { ulid } from "ulid";
import { db } from "./db";
import type { Note } from "./types";

export type NotePatch = Partial<Pick<Note, "body" | "tags" | "importance" | "deleted">>;

export async function createNote(body = "", tags: string[] = []): Promise<Note> {
  const now = Date.now();
  const n: Note = { id: ulid(), body, tags, importance: 0, createdAt: now, updatedAt: now, deleted: 0, dirty: 1 };
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
