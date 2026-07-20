import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDbForTests } from "./db";
import { createNote } from "./notes";
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
    await runSync("tok", f);
    expect((await db.notes.get("REMOTE1"))?.body).toBe("r");
    expect((await db.notes.get(a.id))?.body).toBe("local");
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
