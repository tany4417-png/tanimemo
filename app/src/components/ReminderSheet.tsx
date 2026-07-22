import { useState } from "react";
import type { Note } from "../lib/types";
import { parseRepeatRule } from "../../../shared/repeat";

type RepeatKind = "none" | "daily" | "weekly" | "monthly" | "interval" | "nth_weekday";
const WD = ["日", "月", "火", "水", "木", "金", "土"];

// epoch ms ⇔ datetime-local文字列（ローカルタイム）
const toLocal = (ms: number | null) => {
  if (ms == null) return "";
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};

export function ReminderSheet({ note, onSave, onClose }: {
  note: Note; onSave: (remindAt: number | null, repeatRule: string | null) => void; onClose: () => void;
}) {
  // 防御読み: 既存データにrepeatRuleキーが欠けている可能性を考慮する
  const initial = parseRepeatRule(note.repeatRule ?? null); // 生のJSON.parseは使わない（壊れたJSONで画面ごと落ちる）
  const [when, setWhen] = useState(toLocal(note.remindAt ?? null));
  const [kind, setKind] = useState<RepeatKind>(initial?.type ?? "none");
  const [weekdays, setWeekdays] = useState<number[]>(initial?.type === "weekly" ? initial.weekdays : []);
  const [monthDay, setMonthDay] = useState(initial?.type === "monthly" ? initial.day : 1);
  const [intervalN, setIntervalN] = useState(initial?.type === "interval" ? initial.n : 2);
  const [intervalUnit, setIntervalUnit] = useState<"day" | "week">(initial?.type === "interval" ? initial.unit : "week");
  const [nth, setNth] = useState(initial?.type === "nth_weekday" ? initial.nth : 1);
  const [nthWd, setNthWd] = useState(initial?.type === "nth_weekday" ? initial.weekday : 1);

  const buildRule = (): string | null => {
    if (kind === "none") return null;
    if (kind === "daily") return JSON.stringify({ type: "daily" });
    if (kind === "weekly") return JSON.stringify({ type: "weekly", weekdays: [...weekdays].sort((a, b) => a - b) });
    if (kind === "monthly") return JSON.stringify({ type: "monthly", day: monthDay });
    if (kind === "interval") return JSON.stringify({ type: "interval", unit: intervalUnit, n: intervalN });
    return JSON.stringify({ type: "nth_weekday", nth, weekday: nthWd });
  };

  return (
    <div className="folder-picker reminder-sheet" role="dialog">
      <label>通知日時
        <input type="datetime-local" aria-label="通知日時" value={when} onChange={(e) => setWhen(e.target.value)} />
      </label>
      <label>繰り返し
        <select aria-label="繰り返し" value={kind} onChange={(e) => setKind(e.target.value as RepeatKind)}>
          <option value="none">なし</option>
          <option value="daily">毎日</option>
          <option value="weekly">毎週</option>
          <option value="monthly">毎月</option>
          <option value="interval">間隔指定</option>
          <option value="nth_weekday">第n曜日</option>
        </select>
      </label>
      {kind === "weekly" && (
        <div>{WD.map((w, i) => (
          <label key={i}><input type="checkbox" aria-label={w} checked={weekdays.includes(i)}
            onChange={() => setWeekdays(weekdays.includes(i) ? weekdays.filter((x) => x !== i) : [...weekdays, i])} />{w}</label>
        ))}</div>
      )}
      {kind === "monthly" && (
        <label>毎月<input type="number" min={1} max={31} value={monthDay}
          onChange={(e) => setMonthDay(Number(e.target.value))} />日</label>
      )}
      {kind === "interval" && (
        <label><input type="number" min={1} value={intervalN} onChange={(e) => setIntervalN(Number(e.target.value))} />
          <select value={intervalUnit} onChange={(e) => setIntervalUnit(e.target.value as "day" | "week")}>
            <option value="day">日ごと</option><option value="week">週ごと</option>
          </select></label>
      )}
      {kind === "nth_weekday" && (
        <label>
          <select value={nth} onChange={(e) => setNth(Number(e.target.value))}>
            <option value={1}>第1</option><option value={2}>第2</option><option value={3}>第3</option>
            <option value={4}>第4</option><option value={5}>第5</option><option value={-1}>最終</option>
          </select>
          <select value={nthWd} onChange={(e) => setNthWd(Number(e.target.value))}>
            {WD.map((w, i) => <option key={i} value={i}>{w}曜</option>)}
          </select>
        </label>
      )}
      <div className="picker-actions">
        {note.remindAt != null && <button onClick={() => onSave(null, null)}>通知を解除</button>}
        <button onClick={onClose}>キャンセル</button>
        <button disabled={
          !when ||
          (kind === "weekly" && weekdays.length === 0) ||
          (kind === "monthly" && (!Number.isInteger(monthDay) || monthDay < 1 || monthDay > 31)) ||
          (kind === "interval" && (!Number.isInteger(intervalN) || intervalN < 1))
        }
          onClick={() => onSave(new Date(when).getTime(), buildRule())}>保存</button>
      </div>
    </div>
  );
}
