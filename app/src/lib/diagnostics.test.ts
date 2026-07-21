import { beforeEach, describe, expect, it } from "vitest";
import { addImageFromBlob } from "./attachments";
import { collectDiagnostics } from "./diagnostics";
import { db, resetDbForTests } from "./db";
import { createFolder } from "./folders";
import { createNote, softDeleteNote } from "./notes";

beforeEach(async () => {
  await resetDbForTests();
});

describe("collectDiagnostics", () => {
  it("notes/folders/attachmentsの件数とlastSync・fullResyncV3の状態をまとめて返す", async () => {
    // 未同期・データ無しの初期状態
    const empty = await collectDiagnostics();
    expect(empty.version).toBe(__APP_VERSION__);
    expect(empty.lastSync).toBeNull();
    expect(empty.fullResyncDone).toBe(false);
    expect(empty.notes.total).toBe(0);
    expect(empty.folders.total).toBe(0);
    expect(empty.attachments.metaCount).toBe(0);
    expect(empty.attachments.blobCount).toBe(0);

    // データを作り、lastSync・fullResyncV3も立てた状態
    const a = await createNote("a");
    await createNote("b");
    await softDeleteNote(a.id); // aはゴミ箱行き（deleted=1のまま）。有効メモ数からは外れる
    await createFolder("f1", null);
    await addImageFromBlob("b", new Blob([new Uint8Array([1])], { type: "image/png" }));
    await db.meta.put({ key: "lastSync", value: 123456 });
    await db.meta.put({ key: "fullResyncV3", value: 1 });

    const diag = await collectDiagnostics();
    expect(diag.lastSync).toBe(123456);
    expect(diag.fullResyncDone).toBe(true);
    expect(diag.notes.total).toBe(1); // 有効: bのみ
    expect(diag.notes.trashCount).toBe(1); // ゴミ箱: aのみ
    expect(diag.notes.dirty).toBeGreaterThan(0); // softDeleteNoteでaはdirty=1のまま
    expect(diag.folders.total).toBe(1);
    expect(diag.folders.dirty).toBe(1); // 作成直後はdirty=1
    expect(diag.attachments.metaCount).toBe(1);
    expect(diag.attachments.dirty).toBe(1);
    expect(diag.attachments.blobCount).toBeGreaterThanOrEqual(2); // 本体blob＋サムネblob
  });
});
