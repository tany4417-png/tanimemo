import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDbForTests } from "./db";
import { createFolder } from "./folders";
import {
  createNote,
  listActiveNotes,
  listTrashedNotes,
  purgeExpiredTrashLocal,
  restoreNote,
  softDeleteNote,
  updateNote,
} from "./notes";

beforeEach(async () => {
  await resetDbForTests();
});

describe("メモCRUD", () => {
  it("作成すると一覧に出て、dirty=1が付く", async () => {
    const n = await createNote("最初のメモ");
    expect(n.id).toHaveLength(26);
    expect(n.dirty).toBe(1);
    const list = await listActiveNotes();
    expect(list).toHaveLength(1);
    expect(list[0].body).toBe("最初のメモ");
  });

  it("folderId省略時はnull（既存呼び出しと互換）", async () => {
    const n = await createNote("body");
    expect(n.folderId).toBeNull();
  });

  it("folderIdを指定して作成できる", async () => {
    const n = await createNote("body", "FOLDER1");
    expect(n.folderId).toBe("FOLDER1");
  });

  it("updateNoteでfolderIdを変更できる", async () => {
    const n = await createNote("body");
    const next = await updateNote(n.id, { folderId: "FOLDER2" });
    expect(next.folderId).toBe("FOLDER2");
    expect(next.dirty).toBe(1);
  });

  it("更新でupdatedAtが進みdirty=1に戻る", async () => {
    const n = await createNote("a");
    const before = n.updatedAt;
    const next = await updateNote(n.id, { body: "b", importance: 2 });
    expect(next.body).toBe("b");
    expect(next.importance).toBe(2);
    expect(next.updatedAt).toBeGreaterThanOrEqual(before);
    expect(next.dirty).toBe(1);
  });

  it("softDeleteで一覧から消える（レコードは残る）", async () => {
    const n = await createNote("消すメモ");
    await softDeleteNote(n.id);
    expect(await listActiveNotes()).toHaveLength(0);
  });
});

describe("ゴミ箱", () => {
  it("softDelete後、listTrashedNotesに載りlistActiveNotesには載らない", async () => {
    const n = await createNote("消すメモ");
    await softDeleteNote(n.id);
    const active = await listActiveNotes();
    const trashed = await listTrashedNotes();
    expect(active.find((x) => x.id === n.id)).toBeUndefined();
    expect(trashed.find((x) => x.id === n.id)).toBeDefined();
  });

  it("restoreNoteで戻り、dirty=1が付く", async () => {
    const n = await createNote("復元するメモ");
    await softDeleteNote(n.id);
    const restored = await restoreNote(n.id);
    expect(restored.deleted).toBe(0);
    expect(restored.dirty).toBe(1);
    const active = await listActiveNotes();
    expect(active.find((x) => x.id === n.id)).toBeDefined();
  });

  it("purgeExpiredTrashLocalは31日前に削除されたメモと添付を物理削除し、1日前のものは残す", async () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    const old = await createNote("31日前に消えたメモ");
    await db.notes.update(old.id, { deleted: 1, updatedAt: now - 31 * day });
    await db.attachments.put({
      id: "att-old", noteId: old.id, mime: "image/png", size: 1,
      createdAt: now - 31 * day, updatedAt: now - 31 * day, deleted: 0, dirty: 0,
    });
    await db.attachmentBlobs.put({ id: "att-old", blob: new Blob([new Uint8Array([1])]) });

    const recent = await createNote("1日前に消えたメモ");
    await db.notes.update(recent.id, { deleted: 1, updatedAt: now - 1 * day });

    const purged = await purgeExpiredTrashLocal(now);
    expect(purged).toBe(1);

    expect(await db.notes.get(old.id)).toBeUndefined();
    expect(await db.attachments.get("att-old")).toBeUndefined();
    expect(await db.attachmentBlobs.get("att-old")).toBeUndefined();

    expect(await db.notes.get(recent.id)).toBeDefined();
  });

  it("purgeExpiredTrashLocalは31日超のフォルダtombstoneも物理削除し、1日前のものは残す", async () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    const oldFolder = await createFolder("消えたフォルダ", null);
    await db.folders.update(oldFolder.id, { deleted: 1, updatedAt: now - 31 * day });

    const recentFolder = await createFolder("最近消えたフォルダ", null);
    await db.folders.update(recentFolder.id, { deleted: 1, updatedAt: now - 1 * day });

    const purged = await purgeExpiredTrashLocal(now);
    expect(purged).toBe(1);

    expect(await db.folders.get(oldFolder.id)).toBeUndefined();
    expect(await db.folders.get(recentFolder.id)).toBeDefined();
  });
});
