import { ulid } from "ulid";
import type { Env } from "./index";
import { MAX_ATTACHMENT_BYTES } from "./attachments";
import { upsertAttachment, upsertNote } from "./sync";

export async function handleShare(req: Request, env: Env): Promise<Response> {
  const form = await req.formData();
  const text = form.get("text");
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  const hasText = typeof text === "string" && text.trim() !== "";
  if (!hasText && files.length === 0) return new Response("empty", { status: 400 });

  const now = Date.now();
  const noteId = ulid();
  const body = hasText ? (text as string).trim().replace(/\r\n?/g, "\n") : "";
  await upsertNote(env.DB, { id: noteId, body, importance: 0, createdAt: now, updatedAt: now, deleted: 0, folderId: null });

  for (const f of files) {
    // 上限超過分だけ弾いて残りは保存する（ショートカット経由は複数ファイルをまとめて送れるため、
    // 1件のサイズ超過で他の正常なファイルまで巻き添えにしない）
    if (f.size > MAX_ATTACHMENT_BYTES) continue;
    const attId = ulid();
    const mime = f.type || "application/octet-stream";
    // ショートカット経由ではファイル名が空のことがある。その場合はidの末尾で識別できる名前を作る
    const name = f.name && f.name !== "" ? f.name : `ファイル-${attId.slice(-6)}`;
    const data = await f.arrayBuffer();
    await env.ATT.put(`att/${attId}`, data, { httpMetadata: { contentType: mime } });
    await upsertAttachment(env.DB, { id: attId, noteId, mime, size: data.byteLength, name, createdAt: now, updatedAt: now, deleted: 0 });
  }
  return Response.json({ ok: true, noteId });
}
