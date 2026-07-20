import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDbForTests } from "./db";
import { addImageFromBlob, getImageBlob } from "./attachments";

beforeEach(async () => {
  await resetDbForTests();
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
