import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDbForTests } from "./db";
import { addImageFromBlob, getImageBlob, restoreAttachment, softDeleteAttachment, thumbKey } from "./attachments";

beforeEach(async () => {
  await resetDbForTests();
});

describe("thumbKey", () => {
  it("idに:thumbサフィックスを付与する", () => {
    expect(thumbKey("ABC")).toBe("ABC:thumb");
  });
  it("空文字でも壊れない", () => {
    expect(thumbKey("")).toBe(":thumb");
  });
});

describe("addImageFromBlob", () => {
  it("メタ(dirty=1)と実体が保存される", async () => {
    const meta = await addImageFromBlob("NOTE1", new Blob([new Uint8Array([1, 2])], { type: "image/png" }));
    expect(meta.noteId).toBe("NOTE1");
    expect(meta.mime).toBe("image/png");
    expect(meta.size).toBe(2);
    expect(meta.dirty).toBe(1);
    expect(await db.attachmentBlobs.get(meta.id)).toBeDefined();
  });

  it("本体保存後にサムネレコード（:thumbキー）も保存される", async () => {
    const meta = await addImageFromBlob("NOTE1", new Blob([new Uint8Array([1, 2])], { type: "image/png" }));
    const thumbRec = await db.attachmentBlobs.get(thumbKey(meta.id));
    expect(thumbRec).toBeDefined();
    // attachments（メタ）テーブルにはサムネ用の行が作られない＝export/syncの走査対象に混ざらない
    expect(await db.attachments.get(thumbKey(meta.id))).toBeUndefined();
  });
});

describe("softDeleteAttachment / restoreAttachment", () => {
  it("softDeleteでdeleted=1・dirty=1になり、updatedAtが進む", async () => {
    const meta = await addImageFromBlob("N", new Blob([new Uint8Array([1])], { type: "image/png" }));
    await db.attachments.update(meta.id, { dirty: 0 });
    await new Promise((r) => setTimeout(r, 10));
    await softDeleteAttachment(meta.id);
    const cur = await db.attachments.get(meta.id);
    expect(cur?.deleted).toBe(1);
    expect(cur?.dirty).toBe(1);
    expect(cur && cur.updatedAt > meta.updatedAt).toBe(true);
  });

  it("restoreでdeleted=0に戻り、dirty=1が付く", async () => {
    const meta = await addImageFromBlob("N", new Blob([new Uint8Array([1])], { type: "image/png" }));
    await softDeleteAttachment(meta.id);
    await db.attachments.update(meta.id, { dirty: 0 });
    await restoreAttachment(meta.id);
    const cur = await db.attachments.get(meta.id);
    expect(cur?.deleted).toBe(0);
    expect(cur?.dirty).toBe(1);
  });
});

describe("getImageBlob", () => {
  it("キャッシュがあればfetchしない", async () => {
    const meta = await addImageFromBlob("N", new Blob([new Uint8Array([1])], { type: "image/png" }));
    let called = 0;
    const f = (async () => { called += 1; return new Response(""); }) as typeof fetch;
    const blob = await getImageBlob(meta.id, "tok", f);
    expect(blob).not.toBeNull();
    expect(called).toBe(0);
  });

  it("キャッシュが無ければ取得してキャッシュする", async () => {
    const f = (async () => new Response(new Uint8Array([7]), { headers: { "Content-Type": "image/png" } })) as typeof fetch;
    const blob = await getImageBlob("REMOTE", "tok", f);
    expect(blob).not.toBeNull();
    expect(await db.attachmentBlobs.get("REMOTE")).toBeDefined();
  });

  it("404ならnull", async () => {
    const f = (async () => new Response("", { status: 404 })) as typeof fetch;
    expect(await getImageBlob("NONE", "tok", f)).toBeNull();
  });

  it("オフライン等のネットワーク例外ならnull", async () => {
    const f = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    expect(await getImageBlob("X", "tok", f)).toBeNull();
  });
});

describe("getImageBlob（thumb指定）", () => {
  it("thumbキャッシュがあればそれを返しfetchしない", async () => {
    await db.attachmentBlobs.put({ id: thumbKey("T1"), blob: new Blob([new Uint8Array([9])], { type: "image/jpeg" }) });
    let called = 0;
    const f = (async () => { called += 1; return new Response(""); }) as typeof fetch;
    const blob = await getImageBlob("T1", "tok", f, { thumb: true });
    expect(blob).not.toBeNull();
    expect(called).toBe(0);
  });

  it("thumbが無ければ本体から生成して:thumbキーで保存する", async () => {
    const meta = await addImageFromBlob("N", new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }));
    await db.attachmentBlobs.delete(thumbKey(meta.id));
    const blob = await getImageBlob(meta.id, "tok", fetch, { thumb: true });
    expect(blob).not.toBeNull();
    expect(await db.attachmentBlobs.get(thumbKey(meta.id))).toBeDefined();
  });

  it("本体も無ければnull（fetchも失敗）", async () => {
    const f = (async () => new Response("", { status: 404 })) as typeof fetch;
    expect(await getImageBlob("NONE2", "tok", f, { thumb: true })).toBeNull();
  });
});
