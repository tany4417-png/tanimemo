import type { Env } from "./index";
import type { AttachmentRecord, NoteRecord, SyncRequest, SyncResponse } from "./types";

async function isPurged(db: D1Database, id: string): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 FROM purged WHERE id = ?1`).bind(id).first();
  return row != null;
}

export async function upsertNote(db: D1Database, n: NoteRecord): Promise<boolean> {
  if (await isPurged(db, n.id)) return false;
  await db.prepare(
    `INSERT INTO notes (id, body, tags, importance, created_at, updated_at, deleted, received_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
     ON CONFLICT(id) DO UPDATE SET
       body = excluded.body, tags = excluded.tags, importance = excluded.importance,
       updated_at = excluded.updated_at, deleted = excluded.deleted, received_at = excluded.received_at
     WHERE excluded.updated_at > notes.updated_at`
  ).bind(n.id, n.body, JSON.stringify(n.tags), n.importance, n.createdAt, n.updatedAt, n.deleted, Date.now()).run();
  return true;
}

export async function upsertAttachment(db: D1Database, a: AttachmentRecord): Promise<boolean> {
  if (await isPurged(db, a.id)) return false;
  await db.prepare(
    `INSERT INTO attachments (id, note_id, mime, size, created_at, updated_at, deleted, received_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
     ON CONFLICT(id) DO UPDATE SET
       mime = excluded.mime, size = excluded.size,
       updated_at = excluded.updated_at, deleted = excluded.deleted, received_at = excluded.received_at
     WHERE excluded.updated_at > attachments.updated_at`
  ).bind(a.id, a.noteId, a.mime, a.size, a.createdAt, a.updatedAt, a.deleted, Date.now()).run();
  return true;
}

type NoteRow = { id: string; body: string; tags: string; importance: number; created_at: number; updated_at: number; deleted: 0 | 1 };
type AttRow = { id: string; note_id: string; mime: string; size: number; created_at: number; updated_at: number; deleted: 0 | 1 };

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
// 既知の限界: ゴミ箱保持30日＋このログ保持180日＝約210日以上同期しない端末には、
// その間に他端末で確定した削除が伝わらない（purgedログ自体が消えて削除スタブを合成できなくなるため）。
export const PURGED_LOG_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;

export async function purgeExpiredTrash(env: Env, now: number): Promise<void> {
  const cutoff = now - TRASH_RETENTION_MS;
  const expiredAtt = await env.DB.prepare(
    `SELECT id FROM attachments
     WHERE (deleted = 1 AND updated_at < ?1)
        OR note_id IN (SELECT id FROM notes WHERE deleted = 1 AND updated_at < ?1)`
  ).bind(cutoff).all<{ id: string }>();
  const expiredNotes = await env.DB.prepare(
    `SELECT id FROM notes WHERE deleted = 1 AND updated_at < ?1`
  ).bind(cutoff).all<{ id: string }>();
  for (const row of expiredAtt.results) {
    await env.ATT.delete(`att/${row.id}`);
    await env.DB.prepare(`INSERT OR REPLACE INTO purged (id, purged_at, kind) VALUES (?1, ?2, 'att')`).bind(row.id, now).run();
  }
  for (const row of expiredNotes.results) {
    await env.DB.prepare(`INSERT OR REPLACE INTO purged (id, purged_at, kind) VALUES (?1, ?2, 'note')`).bind(row.id, now).run();
  }
  await env.DB.prepare(
    `DELETE FROM attachments
     WHERE (deleted = 1 AND updated_at < ?1)
        OR note_id IN (SELECT id FROM notes WHERE deleted = 1 AND updated_at < ?1)`
  ).bind(cutoff).run();
  await env.DB.prepare(`DELETE FROM notes WHERE deleted = 1 AND updated_at < ?1`).bind(cutoff).run();
  await env.DB.prepare(`DELETE FROM purged WHERE purged_at < ?1`).bind(now - PURGED_LOG_RETENTION_MS).run();
}

export async function handleSync(req: Request, env: Env): Promise<Response> {
  const body = (await req.json()) as SyncRequest;
  const now = Date.now();
  await purgeExpiredTrash(env, now);
  const purgedIds: string[] = [];
  for (const n of body.notes ?? []) {
    if (!(await upsertNote(env.DB, n))) purgedIds.push(n.id);
  }
  for (const a of body.attachments ?? []) {
    if (!(await upsertAttachment(env.DB, a))) purgedIds.push(a.id);
  }
  const noteRows = await env.DB.prepare(`SELECT * FROM notes WHERE received_at > ?1`).bind(body.since).all<NoteRow>();
  const attRows = await env.DB.prepare(`SELECT * FROM attachments WHERE received_at > ?1`).bind(body.since).all<AttRow>();
  const purgedRows = await env.DB.prepare(`SELECT id, purged_at FROM purged WHERE kind = 'note' AND purged_at > ?1`).bind(body.since).all<{ id: string; purged_at: number }>();
  const noteStubs: NoteRecord[] = purgedRows.results.map((r) => ({
    id: r.id, body: "", tags: [], importance: 0, createdAt: 0, updatedAt: r.purged_at, deleted: 1,
  }));
  const res: SyncResponse = {
    now,
    notes: [
      ...noteRows.results.map((r) => ({
        id: r.id, body: r.body, tags: JSON.parse(r.tags) as string[], importance: r.importance,
        createdAt: r.created_at, updatedAt: r.updated_at, deleted: r.deleted,
      })),
      ...noteStubs,
    ],
    attachments: attRows.results.map((r) => ({
      id: r.id, noteId: r.note_id, mime: r.mime, size: r.size,
      createdAt: r.created_at, updatedAt: r.updated_at, deleted: r.deleted,
    })),
    purgedIds,
  };
  return Response.json(res);
}
