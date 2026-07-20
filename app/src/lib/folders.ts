import { ulid } from "ulid";
import { db } from "./db";
import { updateNote } from "./notes";
import type { Folder, Note } from "./types";

type FolderPatch = Partial<Pick<Folder, "name" | "parentId" | "deleted" | "orderKey">>;

async function updateFolder(id: string, patch: FolderPatch): Promise<Folder> {
  const cur = await db.folders.get(id);
  if (!cur) throw new Error(`folder not found: ${id}`);
  const next: Folder = { ...cur, ...patch, updatedAt: Date.now(), dirty: 1 };
  await db.folders.put(next);
  return next;
}

export async function createFolder(name: string, parentId: string | null): Promise<Folder> {
  const now = Date.now();
  const f: Folder = { id: ulid(), name, parentId, createdAt: now, updatedAt: now, deleted: 0, dirty: 1, orderKey: null };
  await db.folders.put(f);
  return f;
}

export async function renameFolder(id: string, name: string): Promise<Folder> {
  return updateFolder(id, { name });
}

// メモ・フォルダの手動並べ替え（D&D）。orderKeyの計算自体はlib/reorder.tsのplanReorder等の純関数が担う
export async function reorderNote(id: string, orderKey: number): Promise<Note> {
  return updateNote(id, { orderKey });
}

export async function reorderFolder(id: string, orderKey: number): Promise<Folder> {
  return updateFolder(id, { orderKey });
}

// orderKey昇順（nullは末尾、null同士はname昇順）で並べる。手動並べ替えの対象なのでソートモードに関係なく常にこの順
function compareByOrderKey(a: Folder, b: Folder): number {
  const ao = a.orderKey ?? null;
  const bo = b.orderKey ?? null;
  if (ao === null && bo === null) return a.name > b.name ? 1 : a.name < b.name ? -1 : 0;
  if (ao === null) return 1;
  if (bo === null) return -1;
  return ao - bo;
}

export async function listChildFolders(parentId: string | null): Promise<Folder[]> {
  const all = await db.folders.toArray();
  return all
    .filter((f) => f.deleted === 0 && f.parentId === parentId)
    .sort(compareByOrderKey);
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

export async function listAllFolders(): Promise<Folder[]> {
  const all = await db.folders.toArray();
  return all.filter((f) => f.deleted === 0);
}

export type FlatFolder = { folder: Folder; depth: number };

// 親→子の順・同階層は名前昇順でフラット化する（フォルダ選択リスト用）。
// 循環参照（データ破損時の防御。通常はmoveFolderが作成を防ぐ）は経路のidを覚えておき打ち切る。
export function flattenFolderTree(
  folders: Folder[],
  parentId: string | null = null,
  depth = 0,
  ancestors: ReadonlySet<string> = new Set()
): FlatFolder[] {
  const children = folders
    .filter((f) => f.parentId === parentId && !ancestors.has(f.id))
    .sort((a, b) => (a.name > b.name ? 1 : a.name < b.name ? -1 : 0));
  const result: FlatFolder[] = [];
  for (const f of children) {
    result.push({ folder: f, depth });
    result.push(...flattenFolderTree(folders, f.id, depth + 1, new Set(ancestors).add(f.id)));
  }
  return result;
}

// 整合スイープ: 生きているフォルダ(deleted=0)の外を指す孤児メモ・孤児フォルダをルートへ救出する。
// 通信障害中の並行操作や複数端末のずれた同期タイミングでの取りこぼし対策。戻り値は修正件数
export async function repairOrphans(): Promise<number> {
  const aliveFolderIds = new Set((await db.folders.toArray()).filter((f) => f.deleted === 0).map((f) => f.id));
  let fixed = 0;

  const orphanNotes = (await db.notes.toArray()).filter(
    (n) => n.deleted === 0 && n.folderId !== null && !aliveFolderIds.has(n.folderId)
  );
  for (const n of orphanNotes) {
    await updateNote(n.id, { folderId: null });
    fixed += 1;
  }

  const orphanFolders = (await db.folders.toArray()).filter(
    (f) => f.deleted === 0 && f.parentId !== null && !aliveFolderIds.has(f.parentId)
  );
  for (const f of orphanFolders) {
    await updateFolder(f.id, { parentId: null });
    fixed += 1;
  }

  return fixed;
}

export async function deleteFolderKeepingContents(id: string): Promise<void> {
  await db.transaction("rw", db.folders, db.notes, async () => {
    const cur = await db.folders.get(id);
    if (!cur) throw new Error(`folder not found: ${id}`);
    const parentId = cur.parentId;
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
