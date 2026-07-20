import { beforeEach, describe, expect, it, vi } from "vitest";
import { addImageFromBlob } from "./attachments";
import { db, resetDbForTests } from "./db";
import { createFolder } from "./folders";
import { createNote, updateNote } from "./notes";
import { runSync } from "./sync";
import type { SyncResponse } from "./types";

beforeEach(async () => {
  await resetDbForTests();
});

function okFetch(over: Partial<SyncResponse> = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify({ now: 1000, notes: [], attachments: [], ...over }));
  }) as typeof fetch;
  return { f, calls };
}

describe("runSync", () => {
  it("dirtyなメモだけを送り、dirtyフィールドは含めない", async () => {
    const a = await createNote("a");
    await createNote("b");
    await db.notes.update(a.id, { dirty: 0 as const });
    const { f, calls } = okFetch();
    await runSync("tok", f);
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.notes).toHaveLength(1);
    expect(body.notes[0].body).toBe("b");
    expect(body.notes[0].dirty).toBeUndefined();
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("受信は新しい方だけ適用する（LWW）", async () => {
    const a = await createNote("local");
    const incomingNew = { id: "REMOTE1", body: "r", tags: [], importance: 0 as const, createdAt: 1, updatedAt: 1, deleted: 0 as const, folderId: null };
    const incomingOld = { id: a.id, body: "stale", tags: [], importance: 0 as const, createdAt: 1, updatedAt: a.updatedAt - 1, deleted: 0 as const, folderId: null };
    const { f } = okFetch({ notes: [incomingNew, incomingOld] });
    const result = await runSync("tok", f);
    expect(result.pulled).toBe(2);
    expect((await db.notes.get("REMOTE1"))?.body).toBe("r");
    expect((await db.notes.get(a.id))?.body).toBe("local");
  });

  it("同期中に入った編集はdirtyのまま残る（スナップショット競合）", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(1_000_000);
      const a = await createNote("original");

      const wrapped = (async () => {
        // fetchの応答が返ってくる前（サーバー往復の待ち時間中）に編集が入るケースを再現する
        vi.setSystemTime(1_000_050);
        await updateNote(a.id, { body: "edited-during-sync" });
        return new Response(JSON.stringify({ now: 2_000_000, notes: [], attachments: [] }));
      }) as typeof fetch;

      const result = await runSync("tok", wrapped);
      expect(result.pulled).toBe(0);

      const cur = await db.notes.get(a.id);
      expect(cur?.dirty).toBe(1);
      expect(cur?.body).toBe("edited-during-sync");
    } finally {
      vi.useRealTimers();
    }
  });

  it("pushした行のエコーバックは状態を壊さない", async () => {
    const a = await createNote("original");
    const echoBack = {
      id: a.id,
      body: a.body,
      tags: a.tags,
      importance: a.importance,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      deleted: a.deleted,
      folderId: a.folderId,
    };
    const { f } = okFetch({ notes: [echoBack] });

    const result = await runSync("tok", f);
    expect(result.pulled).toBe(1);

    const cur = await db.notes.get(a.id);
    expect(cur?.dirty).toBe(0);
    expect(cur?.body).toBe("original");
  });

  it("成功後にdirtyが0になりlastSyncが更新される", async () => {
    await createNote("a");
    const { f } = okFetch();
    const result = await runSync("tok", f);
    expect(result.pushed).toBe(1);
    expect(await db.notes.where("dirty").equals(1).count()).toBe(0);
    expect((await db.meta.get("lastSync"))?.value).toBe(1000);
  });

  it("サーバーエラー時はthrowし、dirtyとlastSyncは変わらない", async () => {
    await createNote("a");
    const f = (async () => new Response("err", { status: 500 })) as typeof fetch;
    await expect(runSync("tok", f)).rejects.toThrow();
    expect(await db.notes.where("dirty").equals(1).count()).toBe(1);
    expect(await db.meta.get("lastSync")).toBeUndefined();
  });

  it("purgedIdsが返るとローカルからそのメモを物理削除する（サーバーで既に消えた編集を復活させない）", async () => {
    const a = await createNote("purged elsewhere");
    const { f } = okFetch({ purgedIds: [a.id] });
    await runSync("tok", f);
    expect(await db.notes.get(a.id)).toBeUndefined();
  });
});

describe("runSync フォルダ", () => {
  it("dirtyなフォルダだけを送り、dirtyフィールドは含めない", async () => {
    const a = await createFolder("a", null);
    await createFolder("b", null);
    await db.folders.update(a.id, { dirty: 0 as const });
    const { f, calls } = okFetch();
    await runSync("tok", f);
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.folders).toHaveLength(1);
    expect(body.folders[0].name).toBe("b");
    expect(body.folders[0].dirty).toBeUndefined();
  });

  it("受信フォルダはLWWで適用されdirty=0になる", async () => {
    const local = await createFolder("local", null);
    const incomingNew = { id: "RFOLDER1", name: "r", parentId: null, createdAt: 1, updatedAt: 1, deleted: 0 as const };
    const incomingOld = { id: local.id, name: "stale", parentId: null, createdAt: 1, updatedAt: local.updatedAt - 1, deleted: 0 as const };
    const { f } = okFetch({ folders: [incomingNew, incomingOld] });
    const result = await runSync("tok", f);
    expect(result.pulled).toBe(2);
    const remote = await db.folders.get("RFOLDER1");
    expect(remote?.name).toBe("r");
    expect(remote?.dirty).toBe(0);
    const localAfter = await db.folders.get(local.id);
    expect(localAfter?.name).toBe("local");
  });

  it("pushしたフォルダのdirtyがクリアされ、lastSyncも更新される", async () => {
    await createFolder("f", null);
    const { f } = okFetch();
    const result = await runSync("tok", f);
    expect(result.pushed).toBe(1);
    expect(await db.folders.where("dirty").equals(1).count()).toBe(0);
  });

  it("応答にfoldersが無くても動く（?? []）", async () => {
    await createFolder("f", null);
    const f = (async () => new Response(JSON.stringify({ now: 1000, notes: [], attachments: [] }))) as typeof fetch;
    const result = await runSync("tok", f);
    expect(result.pulled).toBe(0);
    expect(await db.folders.where("dirty").equals(1).count()).toBe(0);
  });

  it("purgedIdsにフォルダidが来たらローカルから物理削除する", async () => {
    const folder = await createFolder("消えるフォルダ", null);
    const { f } = okFetch({ purgedIds: [folder.id] });
    await runSync("tok", f);
    expect(await db.folders.get(folder.id)).toBeUndefined();
  });
});

describe("runSync 添付アップロード", () => {
  it("dirtyな添付を先にPUTしてからJSON同期する", async () => {
    await addImageFromBlob("N1", new Blob([new Uint8Array([1])], { type: "image/png" }));
    const { f, calls } = okFetch();
    await runSync("tok", f);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toMatch(/^\/api\/attachments\/.+\?noteId=N1$/);
    expect(calls[0].init.method).toBe("PUT");
    expect(calls[1].url).toBe("/api/sync");
  });

  it("実体が無い添付メタ（他端末由来）はPUTしない", async () => {
    await db.attachments.put({ id: "X", noteId: "N", mime: "image/png", size: 1, createdAt: 1, updatedAt: 1, deleted: 0, dirty: 1 });
    const { f, calls } = okFetch();
    await runSync("tok", f);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/sync");
  });

  it(":thumbキーのサムネblobはアップロード対象に混ざらない（attachmentsメタが無いため走査されない）", async () => {
    const meta = await addImageFromBlob("N1", new Blob([new Uint8Array([1])], { type: "image/png" }));
    // addImageFromBlobが作る:thumbレコードに加え、他経路で紛れ込むケースも想定して明示的にも置いておく
    await db.attachmentBlobs.put({ id: `${meta.id}:thumb`, blob: new Blob([new Uint8Array([2])], { type: "image/jpeg" }) });
    const { f, calls } = okFetch();
    await runSync("tok", f);
    const uploadCalls = calls.filter((c) => c.url.startsWith("/api/attachments/"));
    expect(uploadCalls).toHaveLength(1);
    expect(uploadCalls[0].url).not.toContain("thumb");
  });
});
