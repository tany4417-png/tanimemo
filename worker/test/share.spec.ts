import { SELF, env } from "cloudflare:test";
import { describe, it, expect, afterEach } from "vitest";
import { MAX_ATTACHMENT_BYTES } from "../src/attachments";
import { MAX_SHARE_REQUEST_BYTES } from "../src/share";

const TOKEN = { Authorization: "Bearer test-token" };

async function pull() {
  const res = await SELF.fetch("https://example.com/api/sync", {
    method: "POST", headers: { ...TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ since: 0, notes: [], attachments: [] }),
  });
  return res.json() as Promise<any>;
}

describe("/api/share", () => {
  // このdescribe内のテストは同一DBを共有する（ファイル単位の分離のみ）。
  // 「LIMIT 1」「length(1)」のようなテーブル全体を見るアサーションが前のテストの残留行を拾わないよう、テストごとに掃除する
  afterEach(async () => {
    await env.DB.prepare("DELETE FROM notes").run();
    await env.DB.prepare("DELETE FROM attachments").run();
  });

  it("テキストが無印のメモになる（受信タグは付けない）", async () => {
    const form = new FormData();
    form.append("text", "https://example.com/article");
    const res = await SELF.fetch("https://example.com/api/share", { method: "POST", headers: TOKEN, body: form });
    expect(res.status).toBe(200);
    const data = await pull();
    expect(data.notes).toHaveLength(1);
    expect(data.notes[0].body).toBe("https://example.com/article");
    expect(data.notes[0].tags).toEqual([]);
  });

  it("画像ファイルが添付付きメモになる", async () => {
    const form = new FormData();
    form.append("file", new File([new Uint8Array([9, 8, 7])], "a.png", { type: "image/png" }));
    const res = await SELF.fetch("https://example.com/api/share", { method: "POST", headers: TOKEN, body: form });
    expect(res.status).toBe(200);
    const { noteId } = await res.json() as any;
    const data = await pull();
    expect(data.attachments).toHaveLength(1);
    expect(data.attachments[0].noteId).toBe(noteId);
    const get = await SELF.fetch(`https://example.com/api/attachments/${data.attachments[0].id}`, { headers: TOKEN });
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(new Uint8Array([9, 8, 7]));
  });

  it("共有されたファイルの名前がattachments.nameに入る", async () => {
    const form = new FormData();
    form.append("file", new File([new Uint8Array([1, 2, 3])], "見積書.pdf", { type: "application/pdf" }));
    const res = await SELF.fetch("https://example.com/api/share", {
      method: "POST", headers: { Authorization: "Bearer test-token" }, body: form,
    });
    expect(res.status).toBe(200);
    const row = await env.DB.prepare("SELECT name, mime FROM attachments LIMIT 1").first<{ name: string; mime: string }>();
    expect(row?.name).toBe("見積書.pdf");
    expect(row?.mime).toBe("application/pdf");
  });

  it("空のフォームは400", async () => {
    const res = await SELF.fetch("https://example.com/api/share", { method: "POST", headers: TOKEN, body: new FormData() });
    expect(res.status).toBe(400);
  });

  it("リクエスト全体が明らかに大きすぎる場合はformData解析前に413で弾く（2026-07-26 レビュー指摘: OOM保護）", async () => {
    const huge = new Uint8Array(MAX_SHARE_REQUEST_BYTES + 1);
    const form = new FormData();
    form.append("file", new File([huge], "huge.pdf", { type: "application/pdf" }));
    const res = await SELF.fetch("https://example.com/api/share", { method: "POST", headers: TOKEN, body: form });
    expect(res.status).toBe(413);
    // formData()自体を解析していない＝noteも作られていないことの確認
    const data = await pull();
    expect(data.notes).toHaveLength(0);
  }, 30000);

  it("上限(50MB)を超えるファイルは弾かれ、他の正常なファイルは保存される", async () => {
    const form = new FormData();
    form.append("file", new File([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)], "big.pdf", { type: "application/pdf" }));
    form.append("file", new File([new Uint8Array([1, 2, 3])], "ok.pdf", { type: "application/pdf" }));
    const res = await SELF.fetch("https://example.com/api/share", { method: "POST", headers: TOKEN, body: form });
    expect(res.status).toBe(200);
    const data = await pull();
    expect(data.attachments).toHaveLength(1);
    expect(data.attachments[0].size).toBe(3);
  });

  it("CRLFはLFに正規化される", async () => {
    const form = new FormData();
    form.append("text", "a\r\n- [ ] x");
    const res = await SELF.fetch("https://example.com/api/share", { method: "POST", headers: TOKEN, body: form });
    expect(res.status).toBe(200);
    const { noteId } = (await res.json()) as any;
    const data = await pull();
    const note = data.notes.find((n: any) => n.id === noteId);
    expect(note.body).toBe("a\n- [ ] x");
  });
});
