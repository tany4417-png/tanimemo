import { SELF, env } from "cloudflare:test";
import { describe, it, expect, afterEach } from "vitest";

const api = (path: string, method: string, body?: unknown) =>
  SELF.fetch(`https://example.com${path}`, { method,
    headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined });
const sub = { endpoint: "https://push.example/e1", keys: { p256dh: "k", auth: "a" }, deviceLabel: "iPhone" };
afterEach(async () => { await env.DB.prepare("DELETE FROM push_subscriptions").run(); });

describe("push api", () => {
  it("vapid: 公開鍵を返す", async () => {
    const res = await api("/api/push/vapid", "GET");
    expect(((await res.json()) as any).publicKey).toBeTruthy();
  });
  it("subscribe: 登録され、同一endpointの再登録は上書き（行が増えない）", async () => {
    await api("/api/push/subscribe", "POST", sub);
    await api("/api/push/subscribe", "POST", { ...sub, deviceLabel: "iPhone2" });
    const rows = await env.DB.prepare("SELECT * FROM push_subscriptions").all();
    expect(rows.results.length).toBe(1);
    expect((rows.results[0] as any).device_label).toBe("iPhone2");
  });
  it("unsubscribe: 削除される", async () => {
    await api("/api/push/subscribe", "POST", sub);
    await api("/api/push/subscribe", "DELETE", { endpoint: sub.endpoint });
    const rows = await env.DB.prepare("SELECT * FROM push_subscriptions").all();
    expect(rows.results.length).toBe(0);
  });
  it("認証なしは401", async () => {
    const res = await SELF.fetch("https://example.com/api/push/vapid");
    expect(res.status).toBe(401);
  });
});
