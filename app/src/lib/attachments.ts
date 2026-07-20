import { ulid } from "ulid";
import { db } from "./db";
import type { AttachmentMeta } from "./types";

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
  return meta;
}

export async function getImageBlob(id: string, token: string, fetchFn: typeof fetch = fetch): Promise<Blob | null> {
  const cached = await db.attachmentBlobs.get(id);
  if (cached) return cached.blob;
  const res = await fetchFn(`/api/attachments/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const blob = await res.blob();
  await db.attachmentBlobs.put({ id, blob });
  return blob;
}
