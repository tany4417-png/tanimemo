import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDbForTests } from "./db";
import { createNote } from "./notes";
import type { Folder } from "./types";
import {
  createFolder,
  deleteFolderKeepingContents,
  flattenFolderTree,
  folderPath,
  listAllFolders,
  listChildFolders,
  listNotesIn,
  moveFolder,
  moveNote,
  renameFolder,
  repairOrphans,
} from "./folders";

beforeEach(async () => {
  await resetDbForTests();
});

describe("フォルダCRUD", () => {
  it("作成するとdirty=1・parentIdが保持される", async () => {
    const root = await createFolder("仕事", null);
    expect(root.id).toHaveLength(26);
    expect(root.name).toBe("仕事");
    expect(root.parentId).toBeNull();
    expect(root.dirty).toBe(1);
    expect(root.deleted).toBe(0);
  });

  it("renameFolderでupdatedAtが進みdirty=1のまま名前が変わる", async () => {
    const f = await createFolder("旧名", null);
    await db.folders.update(f.id, { dirty: 0 });
    const before = f.updatedAt;
    const renamed = await renameFolder(f.id, "新名");
    expect(renamed.name).toBe("新名");
    expect(renamed.updatedAt).toBeGreaterThanOrEqual(before);
    expect(renamed.dirty).toBe(1);
  });

  it("listChildFoldersは削除済みを除外し名前昇順で返す", async () => {
    const parent = await createFolder("親", null);
    await createFolder("b", parent.id);
    await createFolder("a", parent.id);
    const c = await createFolder("c", parent.id);
    await db.folders.update(c.id, { deleted: 1 });
    const other = await createFolder("別ツリー", null);
    void other;

    const children = await listChildFolders(parent.id);
    expect(children.map((f) => f.name)).toEqual(["a", "b"]);
    expect(children.find((f) => f.id === c.id)).toBeUndefined();
  });

  it("listChildFolders(null)はルート直下のみ返す", async () => {
    const r1 = await createFolder("root1", null);
    const r2 = await createFolder("root2", null);
    const child = await createFolder("child", r1.id);
    void child;
    const roots = await listChildFolders(null);
    expect(roots.map((f) => f.name).sort()).toEqual(["root1", "root2"]);
    expect(roots.map((f) => f.id).sort()).toEqual([r1.id, r2.id].sort());
  });
});

describe("listNotesIn", () => {
  it("指定フォルダ内の未削除メモだけ返す", async () => {
    const folder = await createFolder("フォルダA", null);
    const n1 = await createNote("in-folder", [], folder.id);
    const n2 = await createNote("root-note");
    const n3 = await createNote("in-folder-deleted", [], folder.id);
    await db.notes.update(n3.id, { deleted: 1 });
    void n2;

    const inFolder = await listNotesIn(folder.id);
    expect(inFolder.map((n) => n.id)).toEqual([n1.id]);

    const rootNotes = await listNotesIn(null);
    expect(rootNotes.find((n) => n.id === n2.id)).toBeDefined();
    expect(rootNotes.find((n) => n.id === n1.id)).toBeUndefined();
  });
});

describe("folderPath", () => {
  it("nullなら空配列", async () => {
    expect(await folderPath(null)).toEqual([]);
  });

  it("3階層でルート→自分の順に返る", async () => {
    const root = await createFolder("root", null);
    const mid = await createFolder("mid", root.id);
    const leaf = await createFolder("leaf", mid.id);
    const path = await folderPath(leaf.id);
    expect(path.map((f) => f.name)).toEqual(["root", "mid", "leaf"]);
  });

  it("親が存在しない（欠損）場合はそこで打ち切る", async () => {
    const orphan = await createFolder("orphan", "MISSING_PARENT");
    const path = await folderPath(orphan.id);
    expect(path.map((f) => f.name)).toEqual(["orphan"]);
  });
});

describe("moveNote", () => {
  it("updateNote経由でfolderIdが変わりdirty=1になる", async () => {
    const folder = await createFolder("移動先", null);
    const n = await createNote("動かすメモ");
    await db.notes.update(n.id, { dirty: 0 });
    await moveNote(n.id, folder.id);
    const cur = await db.notes.get(n.id);
    expect(cur?.folderId).toBe(folder.id);
    expect(cur?.dirty).toBe(1);
  });
});

describe("moveFolder", () => {
  it("自分自身への移動はfalseを返し何も変えない", async () => {
    const f = await createFolder("f", null);
    await db.folders.update(f.id, { dirty: 0 });
    const ok = await moveFolder(f.id, f.id);
    expect(ok).toBe(false);
    const cur = await db.folders.get(f.id);
    expect(cur?.parentId).toBeNull();
    expect(cur?.dirty).toBe(0);
  });

  it("自分の子孫への移動はfalseを返し何も変えない", async () => {
    const root = await createFolder("root", null);
    const child = await createFolder("child", root.id);
    const grandchild = await createFolder("grandchild", child.id);
    await db.folders.update(root.id, { dirty: 0 });

    const ok = await moveFolder(root.id, grandchild.id);
    expect(ok).toBe(false);
    const cur = await db.folders.get(root.id);
    expect(cur?.parentId).toBeNull();
    expect(cur?.dirty).toBe(0);
  });

  it("正常な移動はtrueを返しparentId・dirtyが更新される", async () => {
    const a = await createFolder("a", null);
    const b = await createFolder("b", null);
    await db.folders.update(a.id, { dirty: 0 });

    const ok = await moveFolder(a.id, b.id);
    expect(ok).toBe(true);
    const cur = await db.folders.get(a.id);
    expect(cur?.parentId).toBe(b.id);
    expect(cur?.dirty).toBe(1);
  });
});

describe("deleteFolderKeepingContents", () => {
  it("直下メモと子フォルダを親へ付け替え、フォルダをtombstone化し全部dirtyを立てる", async () => {
    const grandparent = await createFolder("祖父", null);
    const target = await createFolder("対象", grandparent.id);
    const childFolder = await createFolder("子フォルダ", target.id);
    const note = await createNote("対象直下のメモ", [], target.id);

    await db.folders.update(grandparent.id, { dirty: 0 });
    await db.folders.update(target.id, { dirty: 0 });
    await db.folders.update(childFolder.id, { dirty: 0 });
    await db.notes.update(note.id, { dirty: 0 });

    await deleteFolderKeepingContents(target.id);

    const targetAfter = await db.folders.get(target.id);
    expect(targetAfter?.deleted).toBe(1);
    expect(targetAfter?.dirty).toBe(1);

    const childFolderAfter = await db.folders.get(childFolder.id);
    expect(childFolderAfter?.parentId).toBe(grandparent.id);
    expect(childFolderAfter?.dirty).toBe(1);

    const noteAfter = await db.notes.get(note.id);
    expect(noteAfter?.folderId).toBe(grandparent.id);
    expect(noteAfter?.dirty).toBe(1);
  });

  it("親がルート(null)の場合、中身はルート直下へ移る", async () => {
    const target = await createFolder("対象", null);
    const note = await createNote("メモ", [], target.id);
    await deleteFolderKeepingContents(target.id);
    const noteAfter = await db.notes.get(note.id);
    expect(noteAfter?.folderId).toBeNull();
  });
});

describe("listAllFolders", () => {
  it("削除済みを除く全フォルダをフラットに返す", async () => {
    const a = await createFolder("a", null);
    const b = await createFolder("b", a.id);
    const c = await createFolder("c", null);
    await db.folders.update(c.id, { deleted: 1 });

    const all = await listAllFolders();
    expect(all.map((f) => f.id).sort()).toEqual([a.id, b.id].sort());
  });
});

describe("repairOrphans", () => {
  it("存在しないfolderIdを指す孤児メモはルートへ戻りdirtyが立つ", async () => {
    const n = await createNote("孤児メモ", [], "MISSING_FOLDER");
    await db.notes.update(n.id, { dirty: 0 });

    const fixed = await repairOrphans();

    expect(fixed).toBe(1);
    const after = await db.notes.get(n.id);
    expect(after?.folderId).toBeNull();
    expect(after?.dirty).toBe(1);
  });

  it("削除済み(tombstone)フォルダを指す孤児メモもルートへ戻る", async () => {
    const folder = await createFolder("消えるフォルダ", null);
    await db.folders.update(folder.id, { deleted: 1 });
    const n = await createNote("メモ", [], folder.id);
    await db.notes.update(n.id, { dirty: 0 });

    const fixed = await repairOrphans();

    expect(fixed).toBe(1);
    expect((await db.notes.get(n.id))?.folderId).toBeNull();
  });

  it("存在しないparentIdを指す孤児フォルダはルートへ戻りdirtyが立つ", async () => {
    const f = await createFolder("孤児フォルダ", "MISSING_PARENT");
    await db.folders.update(f.id, { dirty: 0 });

    const fixed = await repairOrphans();

    expect(fixed).toBe(1);
    const after = await db.folders.get(f.id);
    expect(after?.parentId).toBeNull();
    expect(after?.dirty).toBe(1);
  });

  it("正常な階層（親子とも生存）は触らない", async () => {
    const root = await createFolder("root", null);
    const child = await createFolder("child", root.id);
    const n = await createNote("メモ", [], child.id);
    await db.folders.update(root.id, { dirty: 0 });
    await db.folders.update(child.id, { dirty: 0 });
    await db.notes.update(n.id, { dirty: 0 });

    const fixed = await repairOrphans();

    expect(fixed).toBe(0);
    expect((await db.folders.get(child.id))?.parentId).toBe(root.id);
    expect((await db.folders.get(child.id))?.dirty).toBe(0);
    expect((await db.notes.get(n.id))?.folderId).toBe(child.id);
    expect((await db.notes.get(n.id))?.dirty).toBe(0);
  });

  it("削除済みのメモ・フォルダ自体は救出対象にしない", async () => {
    const n = await createNote("削除済みメモ", [], "MISSING");
    await db.notes.update(n.id, { deleted: 1, dirty: 0 });
    const f = await createFolder("削除済みフォルダ", "MISSING_PARENT");
    await db.folders.update(f.id, { deleted: 1, dirty: 0 });

    const fixed = await repairOrphans();

    expect(fixed).toBe(0);
    expect((await db.notes.get(n.id))?.dirty).toBe(0);
    expect((await db.folders.get(f.id))?.dirty).toBe(0);
  });
});

describe("flattenFolderTree", () => {
  it("親子関係を深さ優先・同階層は名前昇順でフラット化する", () => {
    const now = 0;
    const mk = (id: string, name: string, parentId: string | null): Folder => ({
      id,
      name,
      parentId,
      createdAt: now,
      updatedAt: now,
      deleted: 0,
      dirty: 0,
    });
    const folders: Folder[] = [
      mk("root-b", "b", null),
      mk("root-a", "a", null),
      mk("a-child", "child", "root-a"),
      mk("a-grandchild", "grandchild", "a-child"),
    ];

    const flat = flattenFolderTree(folders);
    expect(flat.map((x) => [x.folder.id, x.depth])).toEqual([
      ["root-a", 0],
      ["a-child", 1],
      ["a-grandchild", 2],
      ["root-b", 0],
    ]);
  });

  it("空配列を渡すと空配列を返す", () => {
    expect(flattenFolderTree([])).toEqual([]);
  });

  it("循環参照があっても無限ループせず打ち切る", () => {
    const now = 0;
    const mk = (id: string, name: string, parentId: string | null): Folder => ({
      id,
      name,
      parentId,
      createdAt: now,
      updatedAt: now,
      deleted: 0,
      dirty: 0,
    });
    // x -> y -> x という循環（本来moveFolderで防止されるが、データ破損時の防御として検証）。
    // ルート(null)からは循環に到達しないため、循環の内側(xの子)から辿ってガードを通す
    const folders: Folder[] = [mk("x", "x", "y"), mk("y", "y", "x")];
    const flat = flattenFolderTree(folders, "x", 0, new Set(["x"]));
    expect(flat.map((e) => e.folder.id)).toEqual(["y"]);
  });
});
