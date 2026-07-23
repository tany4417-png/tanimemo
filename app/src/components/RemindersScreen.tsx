import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { deriveReminderInfo } from "../lib/reminder-label";
import { BackIcon } from "./icons";

type Props = {
  syncBar: React.ReactNode;
  // 画面切替のスライドインクラス（slide-in-left/right）。ルート要素(.screen)に直接付ける
  slideClass: string;
  onOpenNote: (id: string) => void;
  onBack: () => void;
};

// 通知予定一覧。deleted=0かつremindAt!=nullのメモを次回発火時刻の昇順で表示する。
// 発火済み（単発の24時間超過）は末尾へ回し、行に"fired"クラスを付けて減光する
export function RemindersScreen({ syncBar, slideClass, onOpenNote, onBack }: Props) {
  const rows = useLiveQuery(async () => {
    const now = Date.now();
    const notes = await db.notes.filter((n) => n.deleted === 0 && n.remindAt != null).toArray();
    return notes
      .map((n) => {
        const info = deriveReminderInfo(n.remindAt, n.repeatRule, now);
        return {
          id: n.id,
          title: (n.body.split("\n")[0] || "メモ").slice(0, 60),
          fired: info.fired,
          shown: info.next ?? n.remindAt!,
          label: info.label,
        };
      })
      .sort((a, b) => (a.fired !== b.fired ? (a.fired ? 1 : -1) : a.shown - b.shown));
  }, [], []);

  return (
    <div className={`reminders screen ${slideClass}`}>
      <div className="list-header">
        {syncBar}
        <div className="toolbar">
          <button className="icon-btn" aria-label="戻る" onClick={onBack}>
            <BackIcon />
          </button>
          <h2>リマインダー</h2>
        </div>
      </div>
      <div className="screen-body">
        <div className="bounce-area">
          {rows.length === 0 && <p className="empty">通知を設定したメモはありません</p>}
          <ul className="reminder-list">
            {rows.map((r) => (
              <li
                key={r.id}
                role="listitem"
                className={r.fired ? "reminder-row fired" : "reminder-row"}
                onClick={() => onOpenNote(r.id)}
              >
                <span className="reminder-title">{r.title}</span>
                <span className="reminder-when">{r.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
