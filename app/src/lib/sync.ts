import { db } from "./db";
import type { AttachmentMeta, Folder, Note, SyncResponse } from "./types";

export type SyncResult = { pushed: number; pulled: number };

function stripNote(n: Note) {
  const { dirty: _dirty, ...rest } = n;
  return rest;
}

function stripAtt(a: AttachmentMeta) {
  const { dirty: _dirty, ...rest } = a;
  return rest;
}

function stripFolder(f: Folder) {
  const { dirty: _dirty, ...rest } = f;
  return rest;
}

export async function runSync(token: string, fetchFn: typeof fetch = fetch): Promise<SyncResult> {
  const since = Number((await db.meta.get("lastSync"))?.value ?? 0);
  const dirtyNotes = await db.notes.where("dirty").equals(1).toArray();
  const dirtyAtts = await db.attachments.where("dirty").equals(1).toArray();
  const dirtyFolders = await db.folders.where("dirty").equals(1).toArray();

  for (const a of dirtyAtts) {
    const rec = await db.attachmentBlobs.get(a.id);
    if (!rec) continue;
    const up = await fetchFn(`/api/attachments/${a.id}?noteId=${a.noteId}`, {
      method: "PUT",
      headers: { "Content-Type": a.mime, Authorization: `Bearer ${token}` },
      body: rec.blob,
    });
    if (!up.ok) throw new Error(`attachment upload failed: ${up.status}`);
  }

  const res = await fetchFn("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      since,
      notes: dirtyNotes.map(stripNote),
      attachments: dirtyAtts.map(stripAtt),
      folders: dirtyFolders.map(stripFolder),
    }),
  });
  if (!res.ok) throw new Error(`sync failed: ${res.status}`);
  const data = (await res.json()) as SyncResponse;
  const folders = data.folders ?? [];

  await db.transaction("rw", db.notes, db.attachments, db.attachmentBlobs, db.folders, db.meta, async () => {
    // fetch応答待ちの間に新しい編集が入っている場合、その編集のdirtyを誤ってクリアしないよう、
    // 現在の行のupdatedAtがpushしたスナップショットと一致する場合だけdirtyを落とす。
    for (const n of dirtyNotes) {
      const cur = await db.notes.get(n.id);
      if (cur && cur.updatedAt === n.updatedAt) await db.notes.update(n.id, { dirty: 0 });
    }
    for (const a of dirtyAtts) {
      const cur = await db.attachments.get(a.id);
      if (cur && cur.updatedAt === a.updatedAt) await db.attachments.update(a.id, { dirty: 0 });
    }
    for (const fl of dirtyFolders) {
      const cur = await db.folders.get(fl.id);
      if (cur && cur.updatedAt === fl.updatedAt) await db.folders.update(fl.id, { dirty: 0 });
    }
    for (const n of data.notes) {
      const cur = await db.notes.get(n.id);
      if (!cur || n.updatedAt > cur.updatedAt) await db.notes.put({ ...n, folderId: n.folderId ?? null, dirty: 0 });
    }
    for (const a of data.attachments) {
      const cur = await db.attachments.get(a.id);
      if (!cur || a.updatedAt > cur.updatedAt) await db.attachments.put({ ...a, dirty: 0 });
    }
    for (const fl of folders) {
      const cur = await db.folders.get(fl.id);
      if (!cur || fl.updatedAt > cur.updatedAt) await db.folders.put({ ...fl, dirty: 0 });
    }
    await db.meta.put({ key: "lastSync", value: data.now });

    // サーバーで既にpurge済みのidは、上のdirtyクリアや受信適用で幽霊行が
    // 残っていてもここで物理削除して上書きする（削除の伝達漏れ防止・Fix2）。
    for (const id of data.purgedIds ?? []) {
      await db.notes.delete(id);
      const childAtts = await db.attachments.where("noteId").equals(id).toArray();
      for (const child of childAtts) {
        await db.attachmentBlobs.delete(child.id);
      }
      await db.attachments.where("noteId").equals(id).delete();
      await db.attachmentBlobs.delete(id);
      await db.attachments.delete(id);
      await db.folders.delete(id);
    }
  });

  return {
    pushed: dirtyNotes.length + dirtyAtts.length + dirtyFolders.length,
    pulled: data.notes.length + data.attachments.length + folders.length,
  };
}
