import type { Env } from "./index";
import { upsertAttachment } from "./sync";

// 1ファイルの上限。app/src/lib/attachments.tsのMAX_ATTACHMENT_BYTESと同じ値（50MB）。
// クライアント側チェックだけだと/api/share・このPUTの2経路が素通りしてしまうため、サーバー側にも
// 同じ値を置く。防ぐ実害はWorkerのメモリ上限(128MB)への接近（arrayBuffer化で全体を載せるため）
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

export async function handleAttachmentPut(id: string, req: Request, env: Env): Promise<Response> {
  const noteId = new URL(req.url).searchParams.get("noteId") ?? "";
  const mime = req.headers.get("Content-Type") ?? "application/octet-stream";
  // Content-Lengthがあれば全体を読む前に弾ける。無い/嘘の場合の保険として読み終えたバッファ長でも確認する
  const contentLength = Number(req.headers.get("Content-Length") ?? "0");
  if (contentLength > MAX_ATTACHMENT_BYTES) return new Response("too large", { status: 413 });
  const data = await req.arrayBuffer();
  if (data.byteLength > MAX_ATTACHMENT_BYTES) return new Response("too large", { status: 413 });
  await env.ATT.put(`att/${id}`, data, { httpMetadata: { contentType: mime } });
  // メタ行は「無ければ作る」だけにする（POST /api/sync が届く前にblobだけ先行して届いた場合の保険）。
  // 既存行を「生存・現在時刻」で上書きすると、同じ同期でpushされる削除tombstoneがLWWで負けて
  // 削除済み添付が復活する（2026-07-21 実バグ）。既存行の内容更新はPOST側のLWWに一本化する
  //
  // updated_atを0にする理由（2026-07-26 実バグ）: runSyncは必ずPUT→POSTの順で走る。ここを
  // 現在時刻にすると、直後に届くPOSTのname付きメタ（updated_at=クライアント時刻T）がこの行の
  // updated_at（サーバー時刻。Tより数秒後）を上回れず、upsertAttachmentのLWW条件
  // （WHERE excluded.updated_at > attachments.updated_at）が発火せずnameがNULLのまま固定されていた。
  // 0にしておけば「必ずPOSTに負ける仮の行」になり、メタの権威をPOST /api/syncに一本化できる。
  // deleted=0のままなのでpurgeExpiredTrash（deleted=1 AND updated_at<cutoffのみ対象）には影響しない
  const existing = await env.DB.prepare(`SELECT 1 FROM attachments WHERE id = ?1`).bind(id).first();
  if (!existing) {
    const now = Date.now();
    // created_atはupsertAttachmentのON CONFLICT DO UPDATEで更新されない列なので、POST到着後もこの
    // 値が残り続ける。仮の行だが「添付が実際に作られたおおよその時刻」としては現在時刻が最も近い
    // 近似のため、updated_atとは違いnowのままにする
    await upsertAttachment(env.DB, { id, noteId, mime, size: data.byteLength, createdAt: now, updatedAt: 0, deleted: 0 });
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
