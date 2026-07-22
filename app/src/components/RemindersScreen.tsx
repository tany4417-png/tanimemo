import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { deriveNextFire, parseRepeatRule } from "../../../shared/repeat";
import { fmtWhen as fmt, RULE_LABEL } from "../lib/reminder-label";
import { BackIcon } from "./icons";

// 通知予定一覧。deleted=0かつremindAt!=nullのメモを次回発火時刻の昇順で表示する。
// 発火済み（単発の24時間超過）は末尾へ回し、行に"fired"クラスを付けて減光する
export function RemindersScreen({ onOpenNote, onBack }: { onOpenNote: (id: string) => void; onBack: () => void }) {
  const rows = useLiveQuery(async () => {
    const now = Date.now();
    const notes = await db.notes.filter((n) => n.deleted === 0 && n.remindAt != null).toArray();
    return notes
      .map((n) => {
        const rule = parseRepeatRule(n.repeatRule);
        const next = deriveNextFire(n.remindAt!, rule, now);
        return {
          id: n.id,
          title: (n.body.split("\n")[0] || "メモ").slice(0, 60),
          next,
          shown: next ?? n.remindAt!,
          fired: next == null,
          ruleLabel: rule ? RULE_LABEL[rule.type] : "",
        };
      })
      .sort((a, b) => (a.fired !== b.fired ? (a.fired ? 1 : -1) : a.shown - b.shown));
  }, [], null);

  return (
    <div className="screen">
      <div className="list-header">
        <div className="toolbar">
          <button className="icon-btn" aria-label="戻る" onClick={onBack}>
            <BackIcon />
          </button>
          <h2>通知予定</h2>
        </div>
      </div>
      <div className="screen-body">
        <div className="bounce-area">
          {rows && rows.length === 0 && <p className="empty">通知を設定したメモはありません</p>}
          <ul className="reminder-list">
            {rows?.map((r) => (
              <li
                key={r.id}
                role="listitem"
                className={r.fired ? "reminder-row fired" : "reminder-row"}
                onClick={() => onOpenNote(r.id)}
              >
                <span className="reminder-title">{r.title}</span>
                <span className="reminder-when">
                  {r.fired ? "済" : fmt(r.shown)}
                  {r.ruleLabel && ` ・${r.ruleLabel}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
