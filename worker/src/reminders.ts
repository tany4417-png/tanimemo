import { deriveNextFire, parseRepeatRule } from "../../shared/repeat";

// notesの確定値からremindersを上書きする冪等関数。
// 失敗はthrowし、handleSync側で同期全体を失敗させる（クライアント再送で自己回復）。
export async function syncReminderRow(db: D1Database, noteId: string, now: number): Promise<void> {
  const row = await db.prepare("SELECT remind_at, repeat_rule, deleted FROM notes WHERE id=?")
    .bind(noteId).first<{ remind_at: number | null; repeat_rule: string | null; deleted: number }>();
  const fire = row && !row.deleted && row.remind_at != null
    ? deriveNextFire(row.remind_at, parseRepeatRule(row.repeat_rule), now)
    : null;
  if (fire == null) {
    await db.prepare("DELETE FROM reminders WHERE note_id=?").bind(noteId).run();
  } else {
    await db.prepare(
      "INSERT INTO reminders (note_id, next_fire_at) VALUES (?, ?) ON CONFLICT(note_id) DO UPDATE SET next_fire_at=excluded.next_fire_at"
    ).bind(noteId, fire).run();
  }
}
