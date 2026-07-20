import { SELF, env } from "cloudflare:test";
import { describe, it, expect, afterEach } from "vitest";

const AUTH = { "Content-Type": "application/json", Authorization: "Bearer test-token" };

function note(over: Record<string, unknown> = {}) {
  return { id: "01NOTE", body: "hello", tags: ["メモ"], importance: 0, createdAt: 100, updatedAt: 100, deleted: 0, ...over };
}

async function sync(body: unknown) {
  return SELF.fetch("https://example.com/api/sync", { method: "POST", headers: AUTH, body: JSON.stringify(body) });
}

describe("/api/sync", () => {
  afterEach(async () => {
    await env.DB.prepare("DELETE FROM notes").run();
    await env.DB.prepare("DELETE FROM attachments").run();
  });

  it("pushしたメモがpullで返る", async () => {
    const res1 = await sync({ since: 0, notes: [note()], attachments: [] });
    expect(res1.status).toBe(200);
    const data = await (await sync({ since: 0, notes: [], attachments: [] })).json() as any;
    expect(data.notes).toHaveLength(1);
    expect(data.notes[0].body).toBe("hello");
    expect(data.notes[0].tags).toEqual(["メモ"]);
    expect(typeof data.now).toBe("number");
    expect(data.notes[0].receivedAt).toBeUndefined();
  });

  it("古い更新は勝たない（LWW）", async () => {
    await sync({ since: 0, notes: [note({ updatedAt: 200, body: "new" })], attachments: [] });
    await sync({ since: 0, notes: [note({ updatedAt: 150, body: "old" })], attachments: [] });
    const data = await (await sync({ since: 0, notes: [], attachments: [] })).json() as any;
    expect(data.notes[0].body).toBe("new");
    expect(data.notes[0].updatedAt).toBe(200);
  });

  it("前回pull以降に受理された行だけを返す（received_at透かし）", async () => {
    await sync({ since: 0, notes: [note({ id: "A", updatedAt: 100 })], attachments: [] });
    await new Promise((r) => setTimeout(r, 10));
    const first = await (await sync({ since: 0, notes: [], attachments: [] })).json() as any;
    expect(first.notes.map((n: any) => n.id)).toEqual(["A"]);
    await new Promise((r) => setTimeout(r, 10));
    await sync({ since: 0, notes: [note({ id: "B", updatedAt: 50 })], attachments: [] });
    await new Promise((r) => setTimeout(r, 10));
    const second = await (await sync({ since: first.now, notes: [], attachments: [] })).json() as any;
    expect(second.notes.map((n: any) => n.id)).toEqual(["B"]);
  });

  it("負けた（古い）更新はreceived_atを進めず、再pullで再送されない", async () => {
    await sync({ since: 0, notes: [note({ updatedAt: 200, body: "new" })], attachments: [] });
    await new Promise((r) => setTimeout(r, 10));
    const watermark = (await (await sync({ since: 0, notes: [], attachments: [] })).json() as any).now;
    await new Promise((r) => setTimeout(r, 10));
    await sync({ since: 0, notes: [note({ updatedAt: 150, body: "old" })], attachments: [] });
    await new Promise((r) => setTimeout(r, 10));
    const r2 = await (await sync({ since: watermark, notes: [], attachments: [] })).json() as any;
    expect(r2.notes).toEqual([]);
  });

  it("添付メタも往復する", async () => {
    const att = { id: "01ATT", noteId: "01NOTE", mime: "image/png", size: 3, createdAt: 100, updatedAt: 100, deleted: 0 };
    await sync({ since: 0, notes: [], attachments: [att] });
    const data = await (await sync({ since: 0, notes: [], attachments: [] })).json() as any;
    expect(data.attachments).toHaveLength(1);
    expect(data.attachments[0].noteId).toBe("01NOTE");
  });

  it("30日を過ぎた削除済みメモは同期時に完全削除される", async () => {
    const old = Date.now() - 31 * 24 * 60 * 60 * 1000;
    await sync({ since: 0, notes: [note({ id: "OLD", updatedAt: old, deleted: 1 })], attachments: [] });
    const r = await (await sync({ since: 0, notes: [], attachments: [] })).json() as any;
    expect(r.notes.find((n: any) => n.id === "OLD")).toBeUndefined();
  });

  it("30日以内の削除済みメモは残る（復元可能）", async () => {
    const recent = Date.now() - 1 * 24 * 60 * 60 * 1000;
    await sync({ since: 0, notes: [note({ id: "RECENT", updatedAt: recent, deleted: 1 })], attachments: [] });
    const r = await (await sync({ since: 0, notes: [], attachments: [] })).json() as any;
    expect(r.notes.find((n: any) => n.id === "RECENT")?.deleted).toBe(1);
  });

  it("期限切れメモの添付はR2実体ごと消える", async () => {
    const old = Date.now() - 31 * 24 * 60 * 60 * 1000;
    // 添付をPUTで作成（R2実体あり）→ 親メモを期限切れtombstoneでpush
    await SELF.fetch("https://example.com/api/attachments/PURGEATT?noteId=OLDN", {
      method: "PUT", headers: { Authorization: "Bearer test-token", "Content-Type": "image/png" }, body: new Uint8Array([1]),
    });
    await sync({ since: 0, notes: [note({ id: "OLDN", updatedAt: old, deleted: 1 })], attachments: [] });
    await sync({ since: 0, notes: [], attachments: [] }); // purge発火
    const get = await SELF.fetch("https://example.com/api/attachments/PURGEATT", { headers: { Authorization: "Bearer test-token" } });
    expect(get.status).toBe(404);
    const r = await (await sync({ since: 0, notes: [], attachments: [] })).json() as any;
    expect(r.attachments.find((a: any) => a.id === "PURGEATT")).toBeUndefined();
  });
});
