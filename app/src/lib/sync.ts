import { db } from "./db";
import type { AttachmentMeta, Note, SyncResponse } from "./types";

export type SyncResult = { pushed: number; pulled: number };

function stripNote(n: Note) {
  const { dirty: _dirty, ...rest } = n;
  return rest;
}

function stripAtt(a: AttachmentMeta) {
  const { dirty: _dirty, ...rest } = a;
  return rest;
}

export async function runSync(token: string, fetchFn: typeof fetch = fetch): Promise<SyncResult> {
  const since = Number((await db.meta.get("lastSync"))?.value ?? 0);
  const dirtyNotes = await db.notes.where("dirty").equals(1).toArray();
  const dirtyAtts = await db.attachments.where("dirty").equals(1).toArray();

  const res = await fetchFn("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ since, notes: dirtyNotes.map(stripNote), attachments: dirtyAtts.map(stripAtt) }),
  });
  if (!res.ok) throw new Error(`sync failed: ${res.status}`);
  const data = (await res.json()) as SyncResponse;

  await db.transaction("rw", db.notes, db.attachments, db.meta, async () => {
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
    for (const n of data.notes) {
      const cur = await db.notes.get(n.id);
      if (!cur || n.updatedAt > cur.updatedAt) await db.notes.put({ ...n, dirty: 0 });
    }
    for (const a of data.attachments) {
      const cur = await db.attachments.get(a.id);
      if (!cur || a.updatedAt > cur.updatedAt) await db.attachments.put({ ...a, dirty: 0 });
    }
    await db.meta.put({ key: "lastSync", value: data.now });
  });

  return { pushed: dirtyNotes.length + dirtyAtts.length, pulled: data.notes.length + data.attachments.length };
}
