import { beforeEach, describe, expect, it, vi } from "vitest";
import { addImageFromBlob } from "./attachments";
import { db, resetDbForTests } from "./db";
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
    const incomingNew = { id: "REMOTE1", body: "r", tags: [], importance: 0 as const, createdAt: 1, updatedAt: 1, deleted: 0 as const };
    const incomingOld = { id: a.id, body: "stale", tags: [], importance: 0 as const, createdAt: 1, updatedAt: a.updatedAt - 1, deleted: 0 as const };
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
});
