// 次回発火時刻の導出（app/worker共通の純関数）。
// 曜日は 0=日〜6=土（getDay準拠）。時刻計算はJST=UTC+9固定。
export const DAY_MS = 86400_000;
const JST = 9 * 3600_000;

export type RepeatRule =
  | { type: "daily" }
  | { type: "weekly"; weekdays: number[] }
  | { type: "monthly"; day: number }
  | { type: "interval"; unit: "day" | "week"; n: number }
  | { type: "nth_weekday"; nth: number; weekday: number }; // nth: 1..5 | -1=最終

export function parseRepeatRule(json: string | null): RepeatRule | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as RepeatRule;
    if (!v || typeof v !== "object") return null;
    switch (v.type) {
      case "daily": return { type: "daily" };
      case "weekly":
        return Array.isArray(v.weekdays) && v.weekdays.length > 0 && v.weekdays.every((w) => Number.isInteger(w) && w >= 0 && w <= 6)
          ? { type: "weekly", weekdays: v.weekdays } : null;
      case "monthly":
        return Number.isInteger(v.day) && v.day >= 1 && v.day <= 31 ? { type: "monthly", day: v.day } : null;
      case "interval":
        return (v.unit === "day" || v.unit === "week") && Number.isInteger(v.n) && v.n >= 1
          ? { type: "interval", unit: v.unit, n: v.n } : null;
      case "nth_weekday":
        return (v.nth === -1 || (Number.isInteger(v.nth) && v.nth >= 1 && v.nth <= 5)) && Number.isInteger(v.weekday) && v.weekday >= 0 && v.weekday <= 6
          ? { type: "nth_weekday", nth: v.nth, weekday: v.weekday } : null;
      default: return null;
    }
  } catch {
    return null;
  }
}

// JST日付成分（UTCメソッドで+9hずらした値を読む）
function parts(ms: number) {
  const d = new Date(ms + JST);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), day: d.getUTCDate(), wd: d.getUTCDay() };
}
function jstMs(y: number, mo: number, day: number, timeOfDayMs: number): number {
  return Date.UTC(y, mo, day) - JST + timeOfDayMs;
}
// 基準日時のJSTでの「時刻成分」（0時からのms）
function timeOfDay(remindAt: number): number {
  const d = new Date(remindAt + JST);
  return d.getUTCHours() * 3600_000 + d.getUTCMinutes() * 60_000 + d.getUTCSeconds() * 1000;
}
function daysInMonth(y: number, mo: number): number {
  return new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
}
function nthWeekdayOfMonth(y: number, mo: number, nth: number, weekday: number): number | null {
  const last = daysInMonth(y, mo);
  if (nth === -1) {
    for (let day = last; day >= last - 6; day--) {
      if (new Date(Date.UTC(y, mo, day)).getUTCDay() === weekday) return day;
    }
    return null;
  }
  const firstWd = new Date(Date.UTC(y, mo, 1)).getUTCDay();
  const day = 1 + ((weekday - firstWd + 7) % 7) + (nth - 1) * 7;
  return day <= last ? day : null; // 第5がない月はスキップ
}

// 周期列のうち after より後の最初。単発（ruleなし）は扱わない。
export function nextFireAt(remindAt: number, rule: RepeatRule, after: number): number | null {
  const tod = timeOfDay(remindAt);
  if (rule.type === "interval") {
    const step = (rule.unit === "week" ? 7 : 1) * DAY_MS * Math.max(1, rule.n);
    if (remindAt > after) return remindAt;
    const k = Math.floor((after - remindAt) / step) + 1;
    return remindAt + k * step;
  }
  // 日走査方式: afterのJST日から最大400日先まで
  const start = Math.max(remindAt, after + 1);
  const p0 = parts(start);
  for (let i = 0; i < 400; i++) {
    const d = new Date(Date.UTC(p0.y, p0.mo, p0.day + i));
    const y = d.getUTCFullYear(), mo = d.getUTCMonth(), day = d.getUTCDate(), wd = d.getUTCDay();
    let hit = false;
    if (rule.type === "daily") hit = true;
    else if (rule.type === "weekly") hit = rule.weekdays.includes(wd);
    else if (rule.type === "monthly") hit = day === rule.day;
    else if (rule.type === "nth_weekday") hit = day === nthWeekdayOfMonth(y, mo, rule.nth, rule.weekday);
    if (!hit) continue;
    const cand = jstMs(y, mo, day, tod);
    if (cand > after && cand >= remindAt) return cand;
  }
  return null;
}

// upsert時・表示時に使う導出。単発の24時間ルール込み。
export function deriveNextFire(remindAt: number, rule: RepeatRule | null, now: number): number | null {
  if (!rule) {
    if (remindAt > now) return remindAt;
    return now - remindAt <= DAY_MS ? remindAt : null;
  }
  return nextFireAt(remindAt, rule, now);
}
