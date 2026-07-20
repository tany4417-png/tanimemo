import type { Env } from "./index";
import { upsertAttachment } from "./sync";

export async function handleAttachmentPut(id: string, req: Request, env: Env): Promise<Response> {
  const noteId = new URL(req.url).searchParams.get("noteId") ?? "";
  const mime = req.headers.get("Content-Type") ?? "application/octet-stream";
  const data = await req.arrayBuffer();
  await env.ATT.put(`att/${id}`, data, { httpMetadata: { contentType: mime } });
  const now = Date.now();
  await upsertAttachment(env.DB, { id, noteId, mime, size: data.byteLength, createdAt: now, updatedAt: now, deleted: 0 });
  return Response.json({ ok: true });
}

export async function handleAttachmentGet(id: string, env: Env): Promise<Response> {
  const obj = await env.ATT.get(`att/${id}`);
  if (!obj) return new Response("not found", { status: 404 });
  return new Response(obj.body, {
    headers: { "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream" },
  });
}
