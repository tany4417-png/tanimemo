import type { Env } from "./index";
import type { AttachmentRecord, NoteRecord, SyncRequest, SyncResponse } from "./types";

export async function upsertNote(db: D1Database, n: NoteRecord): Promise<void> {
  await db.prepare(
    `INSERT INTO notes (id, body, tags, importance, created_at, updated_at, deleted, received_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
     ON CONFLICT(id) DO UPDATE SET
       body = excluded.body, tags = excluded.tags, importance = excluded.importance,
       updated_at = excluded.updated_at, deleted = excluded.deleted, received_at = excluded.received_at
     WHERE excluded.updated_at > notes.updated_at`
  ).bind(n.id, n.body, JSON.stringify(n.tags), n.importance, n.createdAt, n.updatedAt, n.deleted, Date.now()).run();
}

export async function upsertAttachment(db: D1Database, a: AttachmentRecord): Promise<void> {
  await db.prepare(
    `INSERT INTO attachments (id, note_id, mime, size, created_at, updated_at, deleted, received_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
     ON CONFLICT(id) DO UPDATE SET
       mime = excluded.mime, size = excluded.size,
       updated_at = excluded.updated_at, deleted = excluded.deleted, received_at = excluded.received_at
     WHERE excluded.updated_at > attachments.updated_at`
  ).bind(a.id, a.noteId, a.mime, a.size, a.createdAt, a.updatedAt, a.deleted, Date.now()).run();
}

type NoteRow = { id: string; body: string; tags: string; importance: number; created_at: number; updated_at: number; deleted: 0 | 1 };
type AttRow = { id: string; note_id: string; mime: string; size: number; created_at: number; updated_at: number; deleted: 0 | 1 };

export async function handleSync(req: Request, env: Env): Promise<Response> {
  const body = (await req.json()) as SyncRequest;
  const now = Date.now();
  for (const n of body.notes ?? []) await upsertNote(env.DB, n);
  for (const a of body.attachments ?? []) await upsertAttachment(env.DB, a);
  const noteRows = await env.DB.prepare(`SELECT * FROM notes WHERE received_at > ?1`).bind(body.since).all<NoteRow>();
  const attRows = await env.DB.prepare(`SELECT * FROM attachments WHERE received_at > ?1`).bind(body.since).all<AttRow>();
  const res: SyncResponse = {
    now,
    notes: noteRows.results.map((r) => ({
      id: r.id, body: r.body, tags: JSON.parse(r.tags) as string[], importance: r.importance,
      createdAt: r.created_at, updatedAt: r.updated_at, deleted: r.deleted,
    })),
    attachments: attRows.results.map((r) => ({
      id: r.id, noteId: r.note_id, mime: r.mime, size: r.size,
      createdAt: r.created_at, updatedAt: r.updated_at, deleted: r.deleted,
    })),
  };
  return Response.json(res);
}
