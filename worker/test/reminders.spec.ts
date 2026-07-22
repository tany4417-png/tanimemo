import { SELF, env } from "cloudflare:test";
import { describe, it, expect, afterEach } from "vitest";
import { runReminderTick } from "../src/reminders";

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

const addSub = (id: string) => env.DB.prepare(
  "INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, device_label, created_at) VALUES (?,?,?,?,?,?)")
  .bind(id, `https://push.example/${id}`, "k", "a", "test", 1).run();
const addNote = (id: string, remindAt: number, rule: string | null) => env.DB.prepare(
  "INSERT INTO notes (id, body, importance, created_at, updated_at, deleted, received_at, remind_at, repeat_rule) VALUES (?,?,0,1,1,0,1,?,?)")
  .bind(id, `${id} title\nbody`, remindAt, rule).run();
const addFire = (id: string, at: number) => env.DB.prepare(
  "INSERT INTO reminders (note_id, next_fire_at) VALUES (?,?)").bind(id, at).run();

describe("runReminderTick", () => {
  it("期限到来分を全購読へ送り、単発は行削除", async () => {
    const now = Date.now();
    await addSub("s1"); await addSub("s2");
    await addNote("n1", now - 1000, null); await addFire("n1", now - 1000);
    const sent: string[] = [];
    await runReminderTick(env.DB, now, async (sub) => { sent.push(sub.id); return { ok: true }; });
    expect(sent.sort()).toEqual(["s1", "s2"]);
    expect(await fireAt("n1")).toBeNull();
  });
  it("繰り返しは次回時刻に更新される", async () => {
    const now = Date.now();
    await addSub("s1");
    await addNote("n1", now - 1000, '{"type":"daily"}'); await addFire("n1", now - 1000);
    await runReminderTick(env.DB, now, async () => ({ ok: true }));
    const row = await fireAt("n1");
    expect(row!.next_fire_at).toBeGreaterThan(now);
  });
  it("24時間より古い単発は送信せず行削除", async () => {
    const now = Date.now();
    await addSub("s1");
    await addNote("n1", now - 2 * 86400_000, null); await addFire("n1", now - 2 * 86400_000);
    const sent: string[] = [];
    await runReminderTick(env.DB, now, async (sub) => { sent.push(sub.id); return { ok: true }; });
    expect(sent).toEqual([]);
    expect(await fireAt("n1")).toBeNull();
  });
  it("410の購読は削除される", async () => {
    const now = Date.now();
    await addSub("s1");
    await addNote("n1", now - 1000, null); await addFire("n1", now - 1000);
    await runReminderTick(env.DB, now, async () => ({ ok: false, status: 410 }));
    const sub = await env.DB.prepare("SELECT id FROM push_subscriptions WHERE id='s1'").first();
    expect(sub).toBeNull();
  });
  it("senderが例外を投げても他の購読への送信とtickの完走が保たれる", async () => {
    const now = Date.now();
    await addSub("s1"); await addSub("s2");
    await addNote("n1", now - 1000, null); await addFire("n1", now - 1000);
    const sent: string[] = [];
    await expect(runReminderTick(env.DB, now, async (sub) => {
      if (sub.id === "s1") throw new Error("boom");
      sent.push(sub.id);
      return { ok: true };
    })).resolves.toBeUndefined();
    expect(sent).toEqual(["s2"]);
    expect(await fireAt("n1")).toBeNull(); // 発火は消化される
    const retries = await env.DB.prepare("SELECT * FROM push_retries WHERE subscription_id='s1'").all();
    expect(retries.results.length).toBe(1);
  });
  it("429はpush_retriesに積まれ、次tickで1回だけ再送後に消える", async () => {
    const now = Date.now();
    await addSub("s1");
    await addNote("n1", now - 1000, null); await addFire("n1", now - 1000);
    await runReminderTick(env.DB, now, async () => ({ ok: false, status: 429 }));
    let retries = await env.DB.prepare("SELECT * FROM push_retries").all();
    expect(retries.results.length).toBe(1);
    const sent: string[] = [];
    await runReminderTick(env.DB, now + 60_000, async (sub) => { sent.push(sub.id); return { ok: true }; });
    expect(sent).toEqual(["s1"]);
    retries = await env.DB.prepare("SELECT * FROM push_retries").all();
    expect(retries.results.length).toBe(0);
  });
});
