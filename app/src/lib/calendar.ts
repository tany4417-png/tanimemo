import { jstDateParts, jstDayStart, occurrencesInRange, parseRepeatRule } from "../../../shared/repeat";
import { accentClassFor } from "./colors";
import { firstLineTitle } from "./markdown";

const DAY = 86400_000;
// 1メモが1画面（42日）に展開できる上限。毎日設定でも42件なので十分な余裕
const PER_NOTE_LIMIT = 200;

export type CalendarNote = {
  id: string;
  body: string;
  folderId: string | null;
  remindAt: number | null;
  repeatRule: string | null;
};

export type CalendarItem = {
  noteId: string;
  at: number;
  title: string;
  accentClass: string;
  fired: boolean;
};

export type CalendarCell = {
  dayStart: number;
  y: number;
  mo: number;
  day: number;
  wd: number;
  inMonth: boolean;
  items: CalendarItem[];
};

// 表示月の1日を含む週の日曜0時から42日ぶん（両端含む）。月によってマス数が変わらないよう6週固定
export function monthRange(y: number, mo: number): { from: number; to: number } {
  const first = jstDayStart(y, mo, 1);
  const from = first - jstDateParts(first).wd * DAY;
  return { from, to: from + 42 * DAY - 1 };
}

export function buildMonthCells(
  y: number,
  mo: number,
  notes: CalendarNote[],
  folderNames: Map<string, string>,
  now: number
): CalendarCell[] {
  const { from, to } = monthRange(y, mo);
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const dayStart = from + i * DAY;
    const p = jstDateParts(dayStart);
    cells.push({ dayStart, y: p.y, mo: p.mo, day: p.day, wd: p.wd, inMonth: p.mo === mo && p.y === y, items: [] });
  }
  // dayStartからマスを引く（日ごとの線形探索を避ける）
  const byDay = new Map<number, CalendarCell>(cells.map((c) => [c.dayStart, c]));

  for (const n of notes) {
    if (n.remindAt == null) continue;
    const rule = parseRepeatRule(n.repeatRule);
    const title = firstLineTitle(n.body);
    const folderName = n.folderId ? folderNames.get(n.folderId) : undefined;
    // フォルダ無しは藍（--indigo）。acc-indigoはstyles.cssで定義する
    const accentClass = folderName ? accentClassFor(folderName) : "acc-indigo";
    for (const at of occurrencesInRange(n.remindAt, rule, from, to, PER_NOTE_LIMIT)) {
      const p = jstDateParts(at);
      const cell = byDay.get(jstDayStart(p.y, p.mo, p.day));
      if (!cell) continue;
      cell.items.push({ noteId: n.id, at, title, accentClass, fired: at <= now });
    }
  }
  for (const c of cells) c.items.sort((a, b) => a.at - b.at);
  return cells;
}
