import type { Env } from "./index";
import { upsertAttachment } from "./sync";

export async function handleAttachmentPut(id: string, req: Request, env: Env): Promise<Response> {
  const noteId = new URL(req.url).searchParams.get("noteId") ?? "";
  const mime = req.headers.get("Content-Type") ?? "application/octet-stream";
  const data = await req.arrayBuffer();
  await env.ATT.put(`att/${id}`, data, { httpMetadata: { contentType: mime } });
  // メタ行は「無ければ作る」だけにする（POST /api/sync が届く前にblobだけ先行して届いた場合の保険）。
  // 既存行を「生存・現在時刻」で上書きすると、同じ同期でpushされる削除tombstoneがLWWで負けて
  // 削除済み添付が復活する（2026-07-21 実バグ）。既存行の内容更新はPOST側のLWWに一本化する
  const existing = await env.DB.prepare(`SELECT 1 FROM attachments WHERE id = ?1`).bind(id).first();
  if (!existing) {
    const now = Date.now();
    await upsertAttachment(env.DB, { id, noteId, mime, size: data.byteLength, createdAt: now, updatedAt: now, deleted: 0 });
  }
  return Response.json({ ok: true });
}

export async function handleAttachmentGet(id: string, env: Env): Promise<Response> {
  const obj = await env.ATT.get(`att/${id}`);
  if (!obj) return new Response("not found", { status: 404 });
  return new Response(obj.body, {
    headers: { "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream" },
  });
}
