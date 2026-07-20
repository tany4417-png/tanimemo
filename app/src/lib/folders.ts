import { ulid } from "ulid";
import { db } from "./db";
import { updateNote } from "./notes";
import type { Folder, Note } from "./types";

type FolderPatch = Partial<Pick<Folder, "name" | "parentId" | "deleted">>;

async function updateFolder(id: string, patch: FolderPatch): Promise<Folder> {
  const cur = await db.folders.get(id);
  if (!cur) throw new Error(`folder not found: ${id}`);
  const next: Folder = { ...cur, ...patch, updatedAt: Date.now(), dirty: 1 };
  await db.folders.put(next);
  return next;
}

export async function createFolder(name: string, parentId: string | null): Promise<Folder> {
  const now = Date.now();
  const f: Folder = { id: ulid(), name, parentId, createdAt: now, updatedAt: now, deleted: 0, dirty: 1 };
  await db.folders.put(f);
  return f;
}

export async function renameFolder(id: string, name: string): Promise<Folder> {
  return updateFolder(id, { name });
}

export async function listChildFolders(parentId: string | null): Promise<Folder[]> {
  const all = await db.folders.toArray();
  return all
    .filter((f) => f.deleted === 0 && f.parentId === parentId)
    .sort((a, b) => (a.name > b.name ? 1 : a.name < b.name ? -1 : 0));
}

export async function listNotesIn(folderId: string | null): Promise<Note[]> {
  const all = await db.notes.toArray();
  return all.filter((n) => n.deleted === 0 && n.folderId === folderId);
}

// ルート→自分の順の祖先列を返す。循環・親の欠損に遭遇したらそこで打ち切る。
export async function folderPath(id: string | null): Promise<Folder[]> {
  if (id === null) return [];
  const chain: Folder[] = [];
  const seen = new Set<string>();
  let cur: string | null = id;
  while (cur !== null && !seen.has(cur)) {
    seen.add(cur);
    const f: Folder | undefined = await db.folders.get(cur);
    if (!f) break;
    chain.push(f);
    cur = f.parentId;
  }
  return chain.reverse();
}

export async function moveNote(noteId: string, folderId: string | null): Promise<void> {
  await updateNote(noteId, { folderId });
}

export async function moveFolder(id: string, newParentId: string | null): Promise<boolean> {
  if (newParentId === id) return false;
  if (newParentId !== null) {
    const ancestors = await folderPath(newParentId);
    if (ancestors.some((f) => f.id === id)) return false;
  }
  const cur = await db.folders.get(id);
  if (!cur) throw new Error(`folder not found: ${id}`);
  await updateFolder(id, { parentId: newParentId });
  return true;
}

export async function deleteFolderKeepingContents(id: string): Promise<void> {
  const cur = await db.folders.get(id);
  if (!cur) throw new Error(`folder not found: ${id}`);
  const parentId = cur.parentId;

  await db.transaction("rw", db.folders, db.notes, async () => {
    const childNotes = (await db.notes.toArray()).filter((n) => n.folderId === id);
    for (const n of childNotes) {
      await updateNote(n.id, { folderId: parentId });
    }
    const childFolders = (await db.folders.toArray()).filter((f) => f.parentId === id);
    for (const f of childFolders) {
      await updateFolder(f.id, { parentId });
    }
    await updateFolder(id, { deleted: 1 });
  });
}
