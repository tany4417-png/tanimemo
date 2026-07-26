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

  // ショートカットを1つにまとめる（受け取る内容にURL・テキスト・ファイルを全部入れる）と、
  // URLやテキストもfileフィールドにファイル化されて届く。それを添付にせず本文に回す
  it("fileとして届いた小さなテキストは添付ではなく本文になる", async () => {
    const form = new FormData();
    form.append("file", new File(["https://example.com/doc"], "url.txt", { type: "text/plain" }));
    const res = await SELF.fetch("https://example.com/api/share", { method: "POST", headers: TOKEN, body: form });
    expect(res.status).toBe(200);
    const { noteId } = (await res.json()) as any;
    const data = await pull();
    expect(data.notes.find((n: any) => n.id === noteId).body).toBe("https://example.com/doc");
    expect(data.attachments.filter((a: any) => a.noteId === noteId)).toHaveLength(0);
  });

  it("typeが空のまま届いた小さなテキストも本文になる（iOSはtypeを付けないことがある）", async () => {
    const form = new FormData();
    form.append("file", new File(["メモの中身"], "input"));
    const res = await SELF.fetch("https://example.com/api/share", { method: "POST", headers: TOKEN, body: form });
    const { noteId } = (await res.json()) as any;
    const data = await pull();
    expect(data.notes.find((n: any) => n.id === noteId).body).toBe("メモの中身");
    expect(data.attachments.filter((a: any) => a.noteId === noteId)).toHaveLength(0);
  });

  it("PDFなどのバイナリは今までどおり添付になる", async () => {
    const form = new FormData();
    form.append("file", new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "見積書.pdf", { type: "application/pdf" }));
    const res = await SELF.fetch("https://example.com/api/share", { method: "POST", headers: TOKEN, body: form });
    const { noteId } = (await res.json()) as any;
    const data = await pull();
    expect(data.notes.find((n: any) => n.id === noteId).body).toBe("");
    const atts = data.attachments.filter((a: any) => a.noteId === noteId);
    expect(atts).toHaveLength(1);
    expect(atts[0].name).toBe("見積書.pdf");
  });

  it("typeが空でも中身がバイナリなら添付として扱う", async () => {
    const form = new FormData();
    // 先頭にNULを含む＝テキストとして扱ってはいけない
    const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x41, 0x42]);
    form.append("file", new File([bytes], "data.bin"));
    const res = await SELF.fetch("https://example.com/api/share", { method: "POST", headers: TOKEN, body: form });
    const { noteId } = (await res.json()) as any;
    const data = await pull();
    expect(data.notes.find((n: any) => n.id === noteId).body).toBe("");
    expect(data.attachments.filter((a: any) => a.noteId === noteId)).toHaveLength(1);
  });

  it("大きなテキストファイルは本文にせず添付のまま", async () => {
    const form = new FormData();
    form.append("file", new File(["あ".repeat(3000)], "long.txt", { type: "text/plain" }));
    const res = await SELF.fetch("https://example.com/api/share", { method: "POST", headers: TOKEN, body: form });
    const { noteId } = (await res.json()) as any;
    const data = await pull();
    expect(data.notes.find((n: any) => n.id === noteId).body).toBe("");
    expect(data.attachments.filter((a: any) => a.noteId === noteId)).toHaveLength(1);
  });

  // ショートカットのフォームフィールドは「テキスト」と「ファイル」の2種類があり、画面から見分けにくい。
  // textキーにファイルとして届いた場合も本文として読む
  it("textキーにファイルとして届いても本文になる", async () => {
    const form = new FormData();
    form.append("text", new File(["https://x.com/someone/status/123"], "input.txt", { type: "text/plain" }));
    const res = await SELF.fetch("https://example.com/api/share", { method: "POST", headers: TOKEN, body: form });
    expect(res.status).toBe(200);
    const { noteId } = (await res.json()) as any;
    const data = await pull();
    expect(data.notes.find((n: any) => n.id === noteId).body).toBe("https://x.com/someone/status/123");
    expect(data.attachments.filter((a: any) => a.noteId === noteId)).toHaveLength(0);
  });

  it("textキーに大きなファイルが来た場合は本文にしない（取り違え防止）", async () => {
    const form = new FormData();
    form.append("text", new File(["あ".repeat(3000)], "long.txt", { type: "text/plain" }));
    const res = await SELF.fetch("https://example.com/api/share", { method: "POST", headers: TOKEN, body: form });
    expect(res.status).toBe(400);
  });

  it("テキストとファイルが同時に届いたら本文と添付の両方になる", async () => {
    const form = new FormData();
    form.append("text", "コメント");
    form.append("file", new File([new Uint8Array([0x25, 0x50])], "a.pdf", { type: "application/pdf" }));
    const res = await SELF.fetch("https://example.com/api/share", { method: "POST", headers: TOKEN, body: form });
    const { noteId } = (await res.json()) as any;
    const data = await pull();
    expect(data.notes.find((n: any) => n.id === noteId).body).toBe("コメント");
    expect(data.attachments.filter((a: any) => a.noteId === noteId)).toHaveLength(1);
  });
});
