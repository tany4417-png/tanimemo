import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDbForTests } from "./db";
import { createNote } from "./notes";
import {
  createFolder,
  deleteFolderKeepingContents,
  folderPath,
  listChildFolders,
  listNotesIn,
  moveFolder,
  moveNote,
  renameFolder,
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
