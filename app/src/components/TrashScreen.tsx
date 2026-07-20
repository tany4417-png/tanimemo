import { useLiveQuery } from "dexie-react-hooks";
import { firstLineTitle } from "../lib/markdown";
import { TRASH_RETENTION_MS, listTrashedNotes, restoreNote } from "../lib/notes";

type Props = { onBack: () => void; onRestored: () => void };

export function TrashScreen({ onBack, onRestored }: Props) {
  const trashed = useLiveQuery(listTrashedNotes, [], []);
  return (
    <div className="trash">
      <div className="toolbar">
        <button onClick={onBack}>←</button>
        <h2>ゴミ箱</h2>
      </div>
      <p className="trash-note">削除から30日たつと自動的に完全削除されます。</p>
      {trashed.map((n) => {
        const daysLeft = Math.max(0, Math.ceil((n.updatedAt + TRASH_RETENTION_MS - Date.now()) / (24 * 60 * 60 * 1000)));
        return (
          <div key={n.id} className="card trash-card">
            <div className="card-title">{n.body.trim() === "" ? "(画像メモ)" : firstLineTitle(n.body)}</div>
            <div className="card-sub">
              削除: {new Date(n.updatedAt).toLocaleString("ja-JP")} / 残り{daysLeft}日
            </div>
            <button
              onClick={async () => {
                await restoreNote(n.id);
                onRestored();
              }}
            >
              復元
            </button>
          </div>
        );
      })}
      {trashed.length === 0 && <p className="empty">ゴミ箱は空です</p>}
    </div>
  );
}
