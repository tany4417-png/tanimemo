import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { jstDateParts, jstDayStart } from "../../../shared/repeat";
import { buildMonthCells, type CalendarCell } from "../lib/calendar";
import { db } from "../lib/db";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

const WD = ["日", "月", "火", "水", "木", "金", "土"];
// 1マスに出す帯の最大数。超えた分は「＋N」にまとめる
const MAX_BADGES = 2;
// 日付から新規作成するときの既定時刻（JST 9:00）
const DEFAULT_HOUR = 9;

// JSTの時刻表示。+9hしてUTCの時分を読む（shared/repeat.tsと同じ流儀）
function timeLabel(at: number): string {
  const d = new Date(at + 9 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

// リマインダーのカレンダー表示。月グリッド（42マス固定）＋選択日の一覧。
// 月移動は見出しの矢印ボタンのみ（スワイプは全画面共通の「右フリックで戻る」と競合するため実装しない）
export function CalendarView({
  onOpenNote,
  onCreateAt,
}: {
  onOpenNote: (id: string) => void;
  onCreateAt: (atMs: number) => void;
}) {
  const today = jstDateParts(Date.now());
  const [ym, setYm] = useState<{ y: number; mo: number }>({ y: today.y, mo: today.mo });
  const [selected, setSelected] = useState<number>(jstDayStart(today.y, today.mo, today.day));

  const notes = useLiveQuery(
    async () => (await db.notes.filter((n) => n.deleted === 0 && n.remindAt != null).toArray())
      .map((n) => ({ id: n.id, body: n.body, folderId: n.folderId, remindAt: n.remindAt, repeatRule: n.repeatRule })),
    [],
    []
  );
  const folderNames = useLiveQuery(
    async () => new Map((await db.folders.filter((f) => f.deleted === 0).toArray()).map((f) => [f.id, f.name])),
    [],
    new Map<string, string>()
  );
  const unreadIds = useLiveQuery(
    async () => new Set((await db.unread.toArray()).map((u) => u.noteId)),
    [],
    new Set<string>()
  );

  const now = Date.now();
  const cells: CalendarCell[] = buildMonthCells(ym.y, ym.mo, notes, folderNames, now);
  const selectedCell = cells.find((c) => c.dayStart === selected);
  const todayStart = jstDayStart(today.y, today.mo, today.day);

  function move(delta: number) {
    const mo = ym.mo + delta;
    const y = ym.y + Math.floor(mo / 12);
    const norm = ((mo % 12) + 12) % 12;
    setYm({ y, mo: norm });
    // 移動先の月に今日があれば今日、無ければ1日を選ぶ
    setSelected(y === today.y && norm === today.mo ? todayStart : jstDayStart(y, norm, 1));
  }

  const selectedParts = jstDateParts(selected);

  return (
    <div className="cal">
      <div className="cal-head">
        <button className="icon-btn" aria-label="前の月" onClick={() => move(-1)}>
          <ChevronLeftIcon />
        </button>
        <span className="cal-title">{`${ym.y}年${ym.mo + 1}月`}</span>
        <button className="icon-btn" aria-label="次の月" onClick={() => move(1)}>
          <ChevronRightIcon />
        </button>
      </div>
      <div className="cal-wd">
        {WD.map((w, i) => (
          <span key={w} className={i === 0 ? "sun" : i === 6 ? "sat" : undefined}>{w}</span>
        ))}
      </div>
      <div className="cal-grid">
        {cells.map((c) => (
          <div
            key={c.dayStart}
            className={[
              "cal-cell",
              c.inMonth ? "in-month" : "out-month",
              c.dayStart === todayStart ? "today" : "",
              c.dayStart === selected ? "selected" : "",
            ].filter(Boolean).join(" ")}
            data-day-start={c.dayStart}
            onClick={() => setSelected(c.dayStart)}
          >
            <span className="cal-n">{c.day}</span>
            {c.items.slice(0, MAX_BADGES).map((it, i) => (
              <span key={`${it.noteId}-${i}`} className={`cal-band ${it.accentClass}${it.fired ? " fired" : ""}`}>
                {it.title}
              </span>
            ))}
            {c.items.length > MAX_BADGES && <span className="cal-more">＋{c.items.length - MAX_BADGES}</span>}
          </div>
        ))}
      </div>
      <div className="cal-daylist">
        <h4>{`${selectedParts.mo + 1}月${selectedParts.day}日（${WD[selectedParts.wd]}）`}</h4>
        {(selectedCell?.items ?? []).length === 0 && <p className="empty">この日の通知はありません</p>}
        {(selectedCell?.items ?? []).map((it, i) => (
          <button
            key={`${it.noteId}-${i}`}
            className={`cal-row${it.fired ? " fired" : ""}`}
            aria-label={`${it.title} ${timeLabel(it.at)}`}
            onClick={() => onOpenNote(it.noteId)}
          >
            <span className={`cal-row-bar ${it.accentClass}`} />
            <span className="cal-row-time">{timeLabel(it.at)}</span>
            <span className="cal-row-title">{it.title}</span>
            {unreadIds.has(it.noteId) && <span className="unread-dot" aria-label="未読の通知" />}
          </button>
        ))}
        {selected >= todayStart && (
          <button className="cal-add" onClick={() => onCreateAt(selected + DEFAULT_HOUR * 3600_000)}>
            ＋ この日に通知付きメモを作る
          </button>
        )}
      </div>
    </div>
  );
}
