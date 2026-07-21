import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDbForTests } from "./db";
import { createNote } from "./notes";
import type { Folder } from "./types";
import {
  countOrphans,
  createFolder,
  deleteFolderWithContents,
  flattenFolderTree,
  folderPath,
  listAllFolders,
  listChildFolders,
  listNotesIn,
  listTrashedFolders,
  moveFolder,
  moveNote,
  renameFolder,
  reorderFolder,
  reorderNote,
  repairOrphans,
  restoreFolderWithContents,
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

  it("listChildFoldersはorderKey昇順（nullは末尾、null同士はname昇順）で返す", async () => {
    const parent = await createFolder("親", null);
    const b = await createFolder("b-null", parent.id);
    const a = await createFolder("a-null", parent.id);
    const withKey2 = await createFolder("key2", parent.id);
    const withKey1 = await createFolder("key1", parent.id);
    await db.folders.update(withKey2.id, { orderKey: 2 });
    await db.folders.update(withKey1.id, { orderKey: 1 });
    void b;
    void a;

    const children = await listChildFolders(parent.id);
    expect(children.map((f) => f.name)).toEqual(["key1", "key2", "a-null", "b-null"]);
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

describe("reorderNote / reorderFolder", () => {
  it("reorderNoteはorderKeyを更新しdirty=1・updatedAtが進む", async () => {
    const note = await createNote("並べ替え対象");
    await db.notes.update(note.id, { dirty: 0 });
    const before = note.updatedAt;

    const after = await reorderNote(note.id, 1.5);

    expect(after.orderKey).toBe(1.5);
    expect(after.dirty).toBe(1);
    expect(after.updatedAt).toBeGreaterThanOrEqual(before);
    const cur = await db.notes.get(note.id);
    expect(cur?.orderKey).toBe(1.5);
    expect(cur?.dirty).toBe(1);
  });

  it("reorderFolderはorderKeyを更新しdirty=1・updatedAtが進む", async () => {
    const folder = await createFolder("並べ替え対象フォルダ", null);
    await db.folders.update(folder.id, { dirty: 0 });
    const before = folder.updatedAt;

    const after = await reorderFolder(folder.id, -1);

    expect(after.orderKey).toBe(-1);
    expect(after.dirty).toBe(1);
    expect(after.updatedAt).toBeGreaterThanOrEqual(before);
    const cur = await db.folders.get(folder.id);
    expect(cur?.orderKey).toBe(-1);
    expect(cur?.dirty).toBe(1);
  });
});

describe("deleteFolderWithContents", () => {
  it("対象フォルダと子フォルダ・直下メモをまとめてtombstone化し全部dirtyを立てる", async () => {
    const grandparent = await createFolder("祖父", null);
    const target = await createFolder("対象", grandparent.id);
    const childFolder = await createFolder("子フォルダ", target.id);
    const note = await createNote("対象直下のメモ", [], target.id);
    const childNote = await createNote("子フォルダ直下のメモ", [], childFolder.id);

    await db.folders.update(grandparent.id, { dirty: 0 });
    await db.folders.update(target.id, { dirty: 0 });
    await db.folders.update(childFolder.id, { dirty: 0 });
    await db.notes.update(note.id, { dirty: 0 });
    await db.notes.update(childNote.id, { dirty: 0 });

    await deleteFolderWithContents(target.id);

    const grandparentAfter = await db.folders.get(grandparent.id);
    expect(grandparentAfter?.deleted).toBe(0); // 祖父（親）自体は無関係で触られない
    expect(grandparentAfter?.dirty).toBe(0);

    const targetAfter = await db.folders.get(target.id);
    expect(targetAfter?.deleted).toBe(1);
    expect(targetAfter?.dirty).toBe(1);

    const childFolderAfter = await db.folders.get(childFolder.id);
    expect(childFolderAfter?.deleted).toBe(1);
    expect(childFolderAfter?.dirty).toBe(1);

    const noteAfter = await db.notes.get(note.id);
    expect(noteAfter?.deleted).toBe(1);
    expect(noteAfter?.dirty).toBe(1);

    const childNoteAfter = await db.notes.get(childNote.id);
    expect(childNoteAfter?.deleted).toBe(1);
    expect(childNoteAfter?.dirty).toBe(1);
  });

  it("2階層ネストでも孫フォルダ・その直下メモまで再帰的にtombstone化する", async () => {
    const root = await createFolder("root", null);
    const mid = await createFolder("mid", root.id);
    const leaf = await createFolder("leaf", mid.id);
    const leafNote = await createNote("葉のメモ", [], leaf.id);

    await deleteFolderWithContents(root.id);

    expect((await db.folders.get(root.id))?.deleted).toBe(1);
    expect((await db.folders.get(mid.id))?.deleted).toBe(1);
    expect((await db.folders.get(leaf.id))?.deleted).toBe(1);
    expect((await db.notes.get(leafNote.id))?.deleted).toBe(1);
  });

  it("既に削除済みのメモには触れない（dirtyが立たない）", async () => {
    const folder = await createFolder("対象", null);
    const alreadyDeleted = await createNote("既に削除済み", [], folder.id);
    await db.notes.update(alreadyDeleted.id, { deleted: 1, dirty: 0 });

    await deleteFolderWithContents(folder.id);

    const after = await db.notes.get(alreadyDeleted.id);
    expect(after?.dirty).toBe(0);
  });

  it("先に単独削除済みの子フォルダを持つ親を削除しても、子のupdatedAt/dirtyは変わらない", async () => {
    const parent = await createFolder("親", null);
    const child = await createFolder("先に削除済みの子", parent.id);
    await db.folders.update(child.id, { deleted: 1, dirty: 0 });
    const before = await db.folders.get(child.id);

    await deleteFolderWithContents(parent.id);

    const after = await db.folders.get(child.id);
    expect(after?.deleted).toBe(1); // 削除済みのまま
    expect(after?.dirty).toBe(0); // 触られていない
    expect(after?.updatedAt).toBe(before?.updatedAt); // タイマーがリセットされない

    // 対象フォルダ自身（id引数）は従来どおり必ずtombstone化される
    const parentAfter = await db.folders.get(parent.id);
    expect(parentAfter?.deleted).toBe(1);
    expect(parentAfter?.dirty).toBe(1);
  });
});

describe("restoreFolderWithContents", () => {
  it("フォルダを復元すると削除済みだった子フォルダ・メモも再帰的に戻る", async () => {
    const parent = await createFolder("親", null);
    const child = await createFolder("子", parent.id);
    const note = await createNote("メモ", [], child.id);

    await deleteFolderWithContents(parent.id);
    await restoreFolderWithContents(parent.id);

    expect((await db.folders.get(parent.id))?.deleted).toBe(0);
    expect((await db.folders.get(child.id))?.deleted).toBe(0);
    expect((await db.notes.get(note.id))?.deleted).toBe(0);
  });

  it("2階層ネストでも孫フォルダまで再帰的に復元する", async () => {
    const root = await createFolder("root", null);
    const mid = await createFolder("mid", root.id);
    const leaf = await createFolder("leaf", mid.id);
    await deleteFolderWithContents(root.id);

    await restoreFolderWithContents(root.id);

    expect((await db.folders.get(root.id))?.deleted).toBe(0);
    expect((await db.folders.get(mid.id))?.deleted).toBe(0);
    expect((await db.folders.get(leaf.id))?.deleted).toBe(0);
  });

  it("親フォルダ自体は復元対象に含めない（parentIdはそのまま、親は別途復元可能）", async () => {
    const grandparent = await createFolder("祖父", null);
    const target = await createFolder("対象", grandparent.id);
    await deleteFolderWithContents(grandparent.id); // 祖父ごと削除（targetも道連れでtombstone化される）

    await restoreFolderWithContents(target.id);

    expect((await db.folders.get(target.id))?.deleted).toBe(0);
    expect((await db.folders.get(grandparent.id))?.deleted).toBe(1);
    expect((await db.folders.get(target.id))?.parentId).toBe(grandparent.id);
  });
});

describe("listTrashedFolders", () => {
  it("削除済みフォルダをupdatedAt降順で返す", async () => {
    const a = await createFolder("a", null);
    const b = await createFolder("b", null);
    await db.folders.update(a.id, { deleted: 1, updatedAt: 100 });
    await db.folders.update(b.id, { deleted: 1, updatedAt: 200 });

    const trashed = await listTrashedFolders();
    expect(trashed.map((f) => f.id)).toEqual([b.id, a.id]);
  });

  it("削除されていないフォルダは含めない", async () => {
    const alive = await createFolder("生存", null);
    const trashed = await listTrashedFolders();
    expect(trashed.find((f) => f.id === alive.id)).toBeUndefined();
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

describe("countOrphans", () => {
  it("孤児メモ・孤児フォルダの合計件数を返す（修復はしない）", async () => {
    const n = await createNote("孤児メモ", [], "MISSING_FOLDER");
    const f = await createFolder("孤児フォルダ", "MISSING_PARENT");

    const count = await countOrphans();

    expect(count).toBe(2);
    // 数えるだけで修復はされていないことを確認
    expect((await db.notes.get(n.id))?.folderId).toBe("MISSING_FOLDER");
    expect((await db.folders.get(f.id))?.parentId).toBe("MISSING_PARENT");
  });

  it("孤児が無ければ0を返す", async () => {
    const root = await createFolder("root", null);
    await createNote("メモ", [], root.id);

    expect(await countOrphans()).toBe(0);
  });

  it("削除済み(tombstone)のメモ・フォルダ自体はカウント対象にしない", async () => {
    const n = await createNote("削除済みメモ", [], "MISSING");
    await db.notes.update(n.id, { deleted: 1 });
    const f = await createFolder("削除済みフォルダ", "MISSING_PARENT");
    await db.folders.update(f.id, { deleted: 1 });

    expect(await countOrphans()).toBe(0);
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
