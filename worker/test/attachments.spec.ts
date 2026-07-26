import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { MAX_ATTACHMENT_BYTES } from "../src/attachments";

const TOKEN = { Authorization: "Bearer test-token" };

describe("/api/attachments", () => {
  it("PUTで保存しGETで取り出せる", async () => {
    const data = new Uint8Array([1, 2, 3]);
    const put = await SELF.fetch("https://example.com/api/attachments/ATT1?noteId=N1", {
      method: "PUT", headers: { ...TOKEN, "Content-Type": "image/png" }, body: data,
    });
    expect(put.status).toBe(200);
    const get = await SELF.fetch("https://example.com/api/attachments/ATT1", { headers: TOKEN });
    expect(get.status).toBe(200);
    expect(get.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(data);
  });

  it("PUTしたメタが/api/syncのpullに現れる", async () => {
    await SELF.fetch("https://example.com/api/attachments/ATT2?noteId=N2", {
      method: "PUT", headers: { ...TOKEN, "Content-Type": "image/jpeg" }, body: new Uint8Array([9]),
    });
    const res = await SELF.fetch("https://example.com/api/sync", {
      method: "POST", headers: { ...TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({ since: 0, notes: [], attachments: [] }),
    });
    const data = await res.json() as any;
    const att = data.attachments.find((a: any) => a.id === "ATT2");
    expect(att).toBeDefined();
    expect(att.noteId).toBe("N2");
    expect(att.mime).toBe("image/jpeg");
    expect(att.size).toBe(1);
  });

  it("無いIDのGETは404", async () => {
    const res = await SELF.fetch("https://example.com/api/attachments/NONE", { headers: TOKEN });
    expect(res.status).toBe(404);
  });

  it("上限(50MB)を超えるPUTは413で拒否し、保存もされない（Content-Lengthベース）", async () => {
    const big = new Uint8Array(MAX_ATTACHMENT_BYTES + 1);
    const res = await SELF.fetch("https://example.com/api/attachments/BIGATT?noteId=N1", {
      method: "PUT",
      headers: { ...TOKEN, "Content-Type": "application/pdf", "Content-Length": String(big.byteLength) },
      body: big,
    });
    expect(res.status).toBe(413);
    const get = await SELF.fetch("https://example.com/api/attachments/BIGATT", { headers: TOKEN });
    expect(get.status).toBe(404);
  });

  it("上限ちょうどのPUTは通る", async () => {
    const exact = new Uint8Array(MAX_ATTACHMENT_BYTES);
    const res = await SELF.fetch("https://example.com/api/attachments/EXACTATT?noteId=N1", {
      method: "PUT",
      headers: { ...TOKEN, "Content-Type": "application/pdf", "Content-Length": String(exact.byteLength) },
      body: exact,
    });
    expect(res.status).toBe(200);
  });
});
