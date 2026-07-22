import { deriveNextFire, parseRepeatRule } from "../../../shared/repeat";

export const RULE_LABEL: Record<string, string> = {
  daily: "毎日", weekly: "毎週", monthly: "毎月", interval: "間隔", nth_weekday: "第n曜日" };

export function fmtWhen(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// カード・一覧行の双方が使う導出結果。fired=発火済み単発、next=次回発火時刻（発火済みはnull）、
// label=画面に出す文字列（設定なしはnull）
export type ReminderInfo = { fired: boolean; next: number | null; label: string | null };

export function deriveReminderInfo(remindAt: number | null, repeatRule: string | null, now: number): ReminderInfo {
  if (remindAt == null) return { fired: false, next: null, label: null };
  const rule = parseRepeatRule(repeatRule);
  const next = deriveNextFire(remindAt, rule, now);
  if (next == null) return { fired: true, next: null, label: "済" };
  return { fired: false, next, label: fmtWhen(next) + (rule ? ` ・${RULE_LABEL[rule.type]}` : "") };
}

// カード・一覧行に出す表示ラベル。設定なしはnull、発火済み単発は「済」
export function reminderLabel(remindAt: number | null, repeatRule: string | null, now: number): string | null {
  return deriveReminderInfo(remindAt, repeatRule, now).label;
}
