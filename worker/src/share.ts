import { ulid } from "ulid";
import type { Env } from "./index";
import { MAX_ATTACHMENT_BYTES } from "./attachments";
import { upsertAttachment, upsertNote } from "./sync";

// リクエスト全体（multipart/form-data）の上限（2026-07-26 レビュー指摘）。
// 個々のファイルの上限（下のf.sizeチェック）だけでは、その前段のreq.formData()自体がリクエスト
// 全体をメモリに展開してパースするため、Workerのメモリ上限(128MB)への接近を防げていなかった。
// 「最大サイズのファイル2つぶん＋multipartのboundary/ヘッダ等のオーバーヘッド余裕(1MB)」を目安に、
// 128MBより十分低いところで「明らかに大きすぎる」リクエストだけをformData()解析前に弾く。
// この線を超えない範囲であれば、個々のファイルが上限超過でもスキップして残りを保存する
// 既存の挙動（下のf.sizeチェック）はそのまま
export const MAX_SHARE_REQUEST_BYTES = MAX_ATTACHMENT_BYTES * 2 + 1024 * 1024;

export async function handleShare(req: Request, env: Env): Promise<Response> {
  // Content-Lengthで明らかな超過をformData()解析前に弾く。ヘッダが無い/信用できない場合は
  // ここでは弾かない（誤検知でリクエストを止めないため。formData()以降は従来どおり）
  const contentLength = Number(req.headers.get("Content-Length") ?? "0");
  if (contentLength > MAX_SHARE_REQUEST_BYTES) return new Response("too large", { status: 413 });
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
