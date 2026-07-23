import { deriveNextFire, parseRepeatRule, nextFireAt, DAY_MS } from "../../shared/repeat";

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

export type SubRow = { id: string; endpoint: string; p256dh: string; auth: string };
export type PushSender = (sub: SubRow, payload: string) => Promise<{ ok: boolean; status?: number }>;
// サブリクエスト50/呼び出し(無料プラン・D1込み)対策。試算はGlobal Constraints参照。超過分は次tick。
// 購読2台（iPhone+PC）前提の試算。3台以上に増やす場合は上限を再計算すること
const TICK_LIMIT = 4;

async function dispatchToAll(db: D1Database, noteId: string, body: string, send: PushSender, subs: SubRow[]) {
  const payload = buildPayload(noteId, body);
  for (const sub of subs) {
    // PushSender契約（例外を投げずok:falseを返す）違反のモック・将来変更への保険。
    // 例外時もstatus 0の失敗と同じ扱いにし、1件の異常が他の購読への送信とtickの完走を壊さないようにする
    const r = await send(sub, payload).catch(() => ({ ok: false as const, status: 0 }));
    if (r.ok) continue;
    if (r.status === 404 || r.status === 410) {
      await db.prepare("DELETE FROM push_subscriptions WHERE id=?").bind(sub.id).run();
    } else {
      await db.prepare("UPDATE push_subscriptions SET failed_count=failed_count+1 WHERE id=?").bind(sub.id).run();
      await db.prepare(
        "INSERT INTO push_retries (note_id, subscription_id, created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING"
      ).bind(noteId, sub.id, Date.now()).run();
    }
  }
}

function noteTitle(body: string): string {
  return (body.split("\n")[0] || "メモ").slice(0, 80);
}

// 通知本文: 2行目以降を1行に潰した抜粋。1行目はtitleに出すので重複させない
function noteBodyPreview(body: string): string {
  return body.split("\n").slice(1).join(" ").replace(/\s+/g, " ").trim().slice(0, 80);
}

// pushペイロード。bodyが空（1行だけのメモ）のときはキー自体を省き、SW側でbody無し通知にする
function buildPayload(noteId: string, body: string): string {
  const preview = noteBodyPreview(body);
  return JSON.stringify({ noteId, title: noteTitle(body), ...(preview ? { body: preview } : {}) });
}

export async function runReminderTick(db: D1Database, now: number, send: PushSender): Promise<void> {
  const subs = (await db.prepare("SELECT id, endpoint, p256dh, auth FROM push_subscriptions").all<SubRow>()).results;

  // 1) 前tickの一時エラー再送（1回だけ。行は成否問わず削除）
  const retries = (await db.prepare(
    `SELECT pr.note_id, pr.subscription_id, n.body, n.deleted
     FROM push_retries pr LEFT JOIN notes n ON n.id = pr.note_id LIMIT ${TICK_LIMIT}`).all<{
    note_id: string; subscription_id: string; body: string | null; deleted: number | null }>()).results;
  for (const r of retries) {
    await db.prepare("DELETE FROM push_retries WHERE note_id=? AND subscription_id=?")
      .bind(r.note_id, r.subscription_id).run();
    const sub = subs.find(s => s.id === r.subscription_id);
    if (!sub || r.body == null || r.deleted) continue; // メモか購読が消えていたら破棄
    const res = await send(sub, buildPayload(r.note_id, r.body)).catch(() => ({ ok: false as const, status: 0 }));
    if (!res.ok && (res.status === 404 || res.status === 410)) {
      await db.prepare("DELETE FROM push_subscriptions WHERE id=?").bind(sub.id).run();
    } // 再々失敗は諦める（push_retriesに積み直さない）
  }

  // 2) 期限到来分
  const due = (await db.prepare(
    `SELECT r.note_id, r.next_fire_at, n.body, n.remind_at, n.repeat_rule
     FROM reminders r JOIN notes n ON n.id = r.note_id AND n.deleted = 0
     WHERE r.next_fire_at <= ? ORDER BY r.next_fire_at LIMIT ${TICK_LIMIT}`).bind(now).all<{
    note_id: string; next_fire_at: number; body: string; remind_at: number; repeat_rule: string | null }>()).results;
  for (const d of due) {
    const rule = parseRepeatRule(d.repeat_rule);
    if (!rule && now - d.next_fire_at > DAY_MS) { // 24時間ルール（cron取得時にも適用）
      await db.prepare("DELETE FROM reminders WHERE note_id=?").bind(d.note_id).run();
      continue;
    }
    await dispatchToAll(db, d.note_id, d.body, send, subs);
    if (rule) {
      const next = nextFireAt(d.remind_at, rule, now);
      if (next == null) await db.prepare("DELETE FROM reminders WHERE note_id=?").bind(d.note_id).run();
      else await db.prepare("UPDATE reminders SET next_fire_at=? WHERE note_id=?").bind(next, d.note_id).run();
    } else {
      await db.prepare("DELETE FROM reminders WHERE note_id=?").bind(d.note_id).run();
    }
  }
  // JOIN条件 n.deleted=0 により、削除済みメモの発火は送信されない。孤児reminders行は
  // syncReminderRow が削除するが、保険としてここでは何もしない（送信もされない）
}
