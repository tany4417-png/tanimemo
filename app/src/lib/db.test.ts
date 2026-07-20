import Dexie from "dexie";
import { describe, expect, it } from "vitest";

describe("Dexie version(2) アップグレード", () => {
  it("既存のv1 notesレコードを保持したままfolderId=nullを付与する", async () => {
    const name = "tanimemo-upgrade-test";
    await Dexie.delete(name);

    const v1 = new Dexie(name);
    v1.version(1).stores({
      notes: "id, updatedAt, createdAt, importance, dirty",
      attachments: "id, noteId, updatedAt, dirty",
      attachmentBlobs: "id",
      meta: "key",
    });
    await v1.open();
    await v1.table("notes").put({
      id: "OLD1",
      body: "既存メモ",
      tags: ["a"],
      importance: 1,
      createdAt: 1,
      updatedAt: 2,
      deleted: 0,
      dirty: 1,
    });
    v1.close();

    const v2 = new Dexie(name);
    v2.version(1).stores({
      notes: "id, updatedAt, createdAt, importance, dirty",
      attachments: "id, noteId, updatedAt, dirty",
      attachmentBlobs: "id",
      meta: "key",
    });
    v2.version(2)
      .stores({
        notes: "id, updatedAt, createdAt, importance, dirty, folderId",
        attachments: "id, noteId, updatedAt, dirty",
        attachmentBlobs: "id",
        meta: "key",
        folders: "id, parentId, updatedAt, dirty",
      })
      .upgrade(async (tx) => {
        await tx.table("notes").toCollection().modify({ folderId: null });
      });
    await v2.open();

    const migrated = await v2.table("notes").get("OLD1");
    expect(migrated).toBeDefined();
    expect(migrated.body).toBe("既存メモ");
    expect(migrated.folderId).toBeNull();
    v2.close();

    await Dexie.delete(name);
  });
});
