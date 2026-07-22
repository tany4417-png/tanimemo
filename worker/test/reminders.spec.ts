import { SELF, env } from "cloudflare:test";
import { describe, it, expect, afterEach } from "vitest";

const note = (over: Record<string, unknown>) => ({
  id: "n1", body: "test", importance: 0, createdAt: 1, updatedAt: 1, deleted: 0, ...over });
const sync = (body: unknown) =>
  SELF.fetch("https://example.com/api/sync", { method: "POST",
    headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
    body: JSON.stringify(body) }).then(r => r.json());
const fireAt = (id: string) =>
  env.DB.prepare("SELECT next_fire_at FROM reminders WHERE note_id=?").bind(id).first<{ next_fire_at: number }>();
afterEach(async () => {
  for (const t of ["notes", "reminders", "push_subscriptions", "push_retries", "purged"])
    await env.DB.prepare(`DELETE FROM ${t}`).run();
});

describe("reminder derivation on sync", () => {
  it("未来の単発: remindersに行ができる", async () => {
    const at = Date.now() + 3600_000;
    await sync({ since: 0, notes: [note({ remindAt: at, repeatRule: null })], attachments: [] });
    expect((await fireAt("n1"))?.next_fire_at).toBe(at);
  });
  it("解除(null): 行が消える", async () => {
    const at = Date.now() + 3600_000;
    await sync({ since: 0, notes: [note({ updatedAt: 1, remindAt: at, repeatRule: null })], attachments: [] });
    await sync({ since: 0, notes: [note({ updatedAt: 2, remindAt: null, repeatRule: null })], attachments: [] });
    expect(await fireAt("n1")).toBeNull();
  });
  it("削除フラグ: 行が消える", async () => {
    const at = Date.now() + 3600_000;
    await sync({ since: 0, notes: [note({ updatedAt: 1, remindAt: at, repeatRule: null })], attachments: [] });
    await sync({ since: 0, notes: [note({ updatedAt: 2, deleted: 1, remindAt: at, repeatRule: null })], attachments: [] });
    expect(await fireAt("n1")).toBeNull();
  });
  it("ゴミ箱復元: 行が復活する", async () => {
    const at = Date.now() + 3600_000;
    // updatedAtは30日保持のpurgeExpiredTrash(既存仕様)と衝突しないよう現実的な値にする
    // （epoch近辺の小さい整数だと「30日超前に削除された」扱いで物理パージされてしまう）
    const base = Date.now();
    await sync({ since: 0, notes: [note({ updatedAt: base, deleted: 1, remindAt: at, repeatRule: null })], attachments: [] });
    await sync({ since: 0, notes: [note({ updatedAt: base + 1, deleted: 0, remindAt: at, repeatRule: null })], attachments: [] });
    expect((await fireAt("n1"))?.next_fire_at).toBe(at);
  });
  it("繰り返し: nowより後の最初が入る", async () => {
    const past = Date.now() - 10 * 86400_000;
    await sync({ since: 0, notes: [note({ remindAt: past, repeatRule: '{"type":"daily"}' })], attachments: [] });
    const row = await fireAt("n1");
    expect(row!.next_fire_at).toBeGreaterThan(Date.now());
    expect(row!.next_fire_at).toBeLessThan(Date.now() + 86400_000 + 60_000);
  });
  it("旧クライアントの欠落pushでは既存のremindersが壊れない", async () => {
    const at = Date.now() + 3600_000;
    await sync({ since: 0, notes: [note({ updatedAt: 1, remindAt: at, repeatRule: null })], attachments: [] });
    await sync({ since: 0, notes: [note({ updatedAt: 2, body: "edited" })], attachments: [] });
    expect((await fireAt("n1"))?.next_fire_at).toBe(at);
  });
  it("LWW負け（stale）のpushはremindersの値を壊さない", async () => {
    const base = Date.now();
    const at1 = base + 3600_000;
    const at2 = base + 7200_000;
    await sync({ since: 0, notes: [note({ updatedAt: base + 1, remindAt: at1, repeatRule: null })], attachments: [] });
    // 古いupdatedAtで別のremindAtを送る（LWW負け=stale経路）
    await sync({ since: 0, notes: [note({ updatedAt: base, remindAt: at2, repeatRule: null })], attachments: [] });
    expect((await fireAt("n1"))?.next_fire_at).toBe(at1); // 勝者の値のまま
  });
});
