import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("認証とhealth", () => {
  it("トークン無しの/api/*は401", async () => {
    const res = await SELF.fetch("https://example.com/api/health");
    expect(res.status).toBe(401);
  });

  it("誤ったトークンは401", async () => {
    const res = await SELF.fetch("https://example.com/api/health", {
      headers: { Authorization: "Bearer wrong" },
    });
    expect(res.status).toBe(401);
  });

  it("正しいトークンで200と{ok:true}", async () => {
    const res = await SELF.fetch("https://example.com/api/health", {
      headers: { Authorization: "Bearer test-token" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
