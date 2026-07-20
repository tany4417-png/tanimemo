import { SELF, env } from "cloudflare:test";
import { describe, it, expect, afterEach } from "vitest";

const AUTH = { "Content-Type": "application/json", Authorization: "Bearer test-token" };

function note(over: Record<string, unknown> = {}) {
  return { id: "01NOTE", body: "hello", tags: ["メモ"], importance: 0, createdAt: 100, updatedAt: 100, deleted: 0, ...over };
}

async function sync(body: unknown) {
  return SELF.fetch("https://example.com/api/sync", { method: "POST", headers: AUTH, body: JSON.stringify(body) });
}

function folder(over: Record<string, unknown> = {}) {
  return { id: "01FOLDER", name: "仕事", parentId: null, createdAt: 100, updatedAt: 100, deleted: 0, ...over };
}

describe("/api/sync", () => {
  afterEach(async () => {
    await env.DB.prepare("DELETE FROM notes").run();
    await env.DB.prepare("DELETE FROM attachments").run();
    await env.DB.prepare("DELETE FROM purged").run();
    await env.DB.prepare("DELETE FROM folders").run();
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

  it("30日を過ぎた削除済みメモは同期時に完全削除される（本体は消え、削除スタブのみ残る）", async () => {
    const old = Date.now() - 31 * 24 * 60 * 60 * 1000;
    await sync({ since: 0, notes: [note({ id: "OLD", updatedAt: old, deleted: 1, body: "secret" })], attachments: [] });
    const r = await (await sync({ since: 0, notes: [], attachments: [] })).json() as any;
    const found = r.notes.filter((n: any) => n.id === "OLD");
    expect(found).toHaveLength(1);
    expect(found[0].body).toBe("");
    expect(found[0].deleted).toBe(1);
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

  it("purge済みメモは古いsinceのpullに削除スタブとして届く（長期オフライン端末対策）", async () => {
    const old = Date.now() - 31 * 24 * 60 * 60 * 1000;
    await sync({ since: 0, notes: [note({ id: "GONE", updatedAt: old, deleted: 1 })], attachments: [] });
    await sync({ since: 0, notes: [], attachments: [] }); // purge発火
    const r = await (await sync({ since: 0, notes: [], attachments: [] })).json() as any;
    const stub = r.notes.find((n: any) => n.id === "GONE");
    expect(stub?.deleted).toBe(1);
  });

  it("purge済みidのpushは復活しない", async () => {
    const old = Date.now() - 31 * 24 * 60 * 60 * 1000;
    await sync({ since: 0, notes: [note({ id: "ZOMBIE", updatedAt: old, deleted: 1 })], attachments: [] });
    await sync({ since: 0, notes: [], attachments: [] }); // purge発火
    await sync({ since: 0, notes: [note({ id: "ZOMBIE", updatedAt: Date.now(), body: "edited-offline", deleted: 0 })], attachments: [] });
    const r = await (await sync({ since: 0, notes: [], attachments: [] })).json() as any;
    expect(r.notes.find((n: any) => n.id === "ZOMBIE" && n.deleted === 0)).toBeUndefined();
  });

  it("生きているメモの添付だけが期限切れになっても、添付idの削除スタブが幻のメモとしてpullに混ざらない", async () => {
    const old = Date.now() - 31 * 24 * 60 * 60 * 1000;
    await sync({
      since: 0,
      notes: [note({ id: "LIVE", updatedAt: Date.now(), deleted: 0 })],
      attachments: [{ id: "OLDATT", noteId: "LIVE", mime: "image/png", size: 1, createdAt: old, updatedAt: old, deleted: 1 }],
    });
    await sync({ since: 0, notes: [], attachments: [] }); // purge発火（添付だけが期限切れ）
    const r = await (await sync({ since: 0, notes: [], attachments: [] })).json() as any;
    expect(r.notes.find((n: any) => n.id === "OLDATT")).toBeUndefined();
    expect(r.notes.find((n: any) => n.id === "LIVE")?.deleted).toBe(0);
  });

  it("purge済みidへのpushはpurgedIdsとして返る", async () => {
    const old = Date.now() - 31 * 24 * 60 * 60 * 1000;
    await sync({ since: 0, notes: [note({ id: "ZOMBIE2", updatedAt: old, deleted: 1 })], attachments: [] });
    await sync({ since: 0, notes: [], attachments: [] }); // purge発火
    const r = await (await sync({
      since: 0,
      notes: [note({ id: "ZOMBIE2", updatedAt: Date.now(), body: "edited-offline", deleted: 0 })],
      attachments: [],
    })).json() as any;
    expect(r.purgedIds).toContain("ZOMBIE2");
  });

  it("pushしたフォルダがpullで返る（name/parentIdが保たれる）", async () => {
    const res1 = await sync({ since: 0, notes: [], attachments: [], folders: [folder({ id: "F1", name: "仕事", parentId: null })] });
    expect(res1.status).toBe(200);
    const data = await (await sync({ since: 0, notes: [], attachments: [], folders: [] })).json() as any;
    expect(data.folders).toHaveLength(1);
    expect(data.folders[0].name).toBe("仕事");
    expect(data.folders[0].parentId).toBe(null);
  });

  it("フォルダの古い更新は勝たない（LWW）", async () => {
    await sync({ since: 0, notes: [], attachments: [], folders: [folder({ updatedAt: 200, name: "new" })] });
    await sync({ since: 0, notes: [], attachments: [], folders: [folder({ updatedAt: 150, name: "old" })] });
    const data = await (await sync({ since: 0, notes: [], attachments: [], folders: [] })).json() as any;
    expect(data.folders[0].name).toBe("new");
    expect(data.folders[0].updatedAt).toBe(200);
  });

  it("メモのfolderIdが往復する", async () => {
    await sync({ since: 0, notes: [note({ id: "WITHFOLDER", folderId: "F2" })], attachments: [], folders: [] });
    const data = await (await sync({ since: 0, notes: [], attachments: [], folders: [] })).json() as any;
    expect(data.notes.find((n: any) => n.id === "WITHFOLDER")?.folderId).toBe("F2");
  });

  it("30日を過ぎた削除済みフォルダはpurgeされ、削除スタブがfolders配列に届く（notes配列に混ざらない）", async () => {
    const old = Date.now() - 31 * 24 * 60 * 60 * 1000;
    await sync({ since: 0, notes: [], attachments: [], folders: [folder({ id: "OLDFOLDER", updatedAt: old, deleted: 1 })] });
    const r = await (await sync({ since: 0, notes: [], attachments: [], folders: [] })).json() as any;
    const stub = r.folders.find((f: any) => f.id === "OLDFOLDER");
    expect(stub?.deleted).toBe(1);
    expect(r.notes.find((n: any) => n.id === "OLDFOLDER")).toBeUndefined();
  });

  it("folderIdフィールドの無いpush（旧クライアント）はfolder_idを現状維持する", async () => {
    await sync({ since: 0, notes: [note({ id: "OLDCLIENT", folderId: "F1" })], attachments: [] });
    // 旧クライアントを模してfolderIdフィールド自体を持たないオブジェクトをpushする
    const legacyBody = {
      since: 0,
      notes: [{ id: "OLDCLIENT", body: "edited-by-old-client", tags: ["メモ"], importance: 0, createdAt: 100, updatedAt: 200, deleted: 0 }],
      attachments: [],
    };
    const res = await sync(legacyBody);
    expect(res.status).toBe(200);
    const data = await (await sync({ since: 0, notes: [], attachments: [] })).json() as any;
    const after = data.notes.find((n: any) => n.id === "OLDCLIENT");
    expect(after?.body).toBe("edited-by-old-client");
    expect(after?.folderId).toBe("F1");
  });

  it("明示的にfolderId: nullをpushするとルート移動として反映される", async () => {
    await sync({ since: 0, notes: [note({ id: "EXPLICITNULL", folderId: "F1" })], attachments: [] });
    await sync({ since: 0, notes: [note({ id: "EXPLICITNULL", folderId: null, updatedAt: 200 })], attachments: [] });
    const data = await (await sync({ since: 0, notes: [], attachments: [] })).json() as any;
    expect(data.notes.find((n: any) => n.id === "EXPLICITNULL")?.folderId).toBeNull();
  });

  it("purge済みフォルダidのpushは復活せずpurgedIdsに載る", async () => {
    const old = Date.now() - 31 * 24 * 60 * 60 * 1000;
    await sync({ since: 0, notes: [], attachments: [], folders: [folder({ id: "ZOMBIEFOLDER", updatedAt: old, deleted: 1 })] });
    await sync({ since: 0, notes: [], attachments: [], folders: [] }); // purge発火
    const r = await (await sync({
      since: 0,
      notes: [],
      attachments: [],
      folders: [folder({ id: "ZOMBIEFOLDER", name: "edited-offline", updatedAt: Date.now(), deleted: 0 })],
    })).json() as any;
    expect(r.purgedIds).toContain("ZOMBIEFOLDER");
    expect(r.folders.find((f: any) => f.id === "ZOMBIEFOLDER" && f.deleted === 0)).toBeUndefined();
  });
});
