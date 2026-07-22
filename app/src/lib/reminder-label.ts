import { deriveNextFire, parseRepeatRule } from "../../../shared/repeat";

export const RULE_LABEL: Record<string, string> = {
  daily: "毎日", weekly: "毎週", monthly: "毎月", interval: "間隔", nth_weekday: "第n曜日" };

export function fmtWhen(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// カード・一覧行に出す表示ラベル。設定なしはnull、発火済み単発は「済」
export function reminderLabel(remindAt: number | null, repeatRule: string | null, now: number): string | null {
  if (remindAt == null) return null;
  const rule = parseRepeatRule(repeatRule);
  const next = deriveNextFire(remindAt, rule, now);
  if (next == null) return "済";
  return fmtWhen(next) + (rule ? ` ・${RULE_LABEL[rule.type]}` : "");
}
