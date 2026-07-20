import { ulid } from "ulid";
import { db } from "./db";
import type { AttachmentMeta } from "./types";

// サムネイル用blobの保存キー規約。attachmentBlobsに本体と別レコードで持たせる。
// attachments（メタ）テーブルには対応する行を作らないため、メタ起点で走査するexport/syncには
// 混ざらない（詳細はexport.ts/sync.tsのコメント参照）
export function thumbKey(id: string): string {
  return `${id}:thumb`;
}

// 原寸blobから軽量なJPEGサムネイルを作る。createImageBitmap/canvasが使えない環境（テストのnode環境や
// 一部旧ブラウザ）では例外を握りつぶし、元blobをそのまま返すフェイルセーフにする
export async function makeThumbnail(blob: Blob, maxEdge = 320): Promise<Blob> {
  try {
    if (typeof createImageBitmap !== "function") return blob;
    const bitmap = await createImageBitmap(blob);
    try {
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));

      if (typeof OffscreenCanvas !== "undefined") {
        const canvas = new OffscreenCanvas(w, h);
        const ctx = canvas.getContext("2d");
        if (!ctx) return blob;
        ctx.drawImage(bitmap, 0, 0, w, h);
        return await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
      }
      if (typeof document !== "undefined") {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return blob;
        ctx.drawImage(bitmap, 0, 0, w, h);
        return await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.8);
        });
      }
      return blob;
    } finally {
      bitmap.close();
    }
  } catch {
    return blob;
  }
}

export async function addImageFromBlob(noteId: string, blob: Blob): Promise<AttachmentMeta> {
  const now = Date.now();
  const meta: AttachmentMeta = {
    id: ulid(), noteId, mime: blob.type || "application/octet-stream", size: blob.size,
    createdAt: now, updatedAt: now, deleted: 0, dirty: 1,
  };
  await db.transaction("rw", db.attachments, db.attachmentBlobs, async () => {
    await db.attachments.put(meta);
    await db.attachmentBlobs.put({ id: meta.id, blob });
  });
  // 本体保存後にサムネも生成・保存する（一覧・Galleryのサムネ表示を軽くするため）
  const thumb = await makeThumbnail(blob);
  await db.attachmentBlobs.put({ id: thumbKey(meta.id), blob: thumb });
  return meta;
}

async function fetchAndCacheBlob(id: string, token: string, fetchFn: typeof fetch): Promise<Blob | null> {
  let res: Response;
  try {
    res = await fetchFn(`/api/attachments/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const blob = await res.blob();
  await db.attachmentBlobs.put({ id, blob });
  return blob;
}

export async function getImageBlob(
  id: string,
  token: string,
  fetchFn: typeof fetch = fetch,
  opts?: { thumb?: boolean }
): Promise<Blob | null> {
  if (opts?.thumb) {
    const key = thumbKey(id);
    const cachedThumb = await db.attachmentBlobs.get(key);
    if (cachedThumb) return cachedThumb.blob;
    // サムネ未生成（旧データ・他端末で作った添付など）: 本体blobから作って保存する
    const body = await getImageBlob(id, token, fetchFn);
    if (!body) return null;
    const thumb = await makeThumbnail(body);
    await db.attachmentBlobs.put({ id: key, blob: thumb });
    return thumb;
  }
  const cached = await db.attachmentBlobs.get(id);
  if (cached) return cached.blob;
  return fetchAndCacheBlob(id, token, fetchFn);
}
