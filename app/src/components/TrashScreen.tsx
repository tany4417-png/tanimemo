import { useLiveQuery } from "dexie-react-hooks";
import { firstLineTitle } from "../lib/markdown";
import { TRASH_RETENTION_MS, listTrashedNotes, restoreNote } from "../lib/notes";
import { BackIcon } from "./icons";
import { CardThumbs } from "./NoteList";

type Props = { onBack: () => void; onRestored: () => void };

export function TrashScreen({ onBack, onRestored }: Props) {
  const trashed = useLiveQuery(listTrashedNotes, [], []);
  return (
    <div className="trash">
      <div className="toolbar">
        <button className="icon-btn" onClick={onBack} aria-label="戻る">
          <BackIcon />
        </button>
        <h2>ゴミ箱</h2>
      </div>
      <p className="trash-note">削除から30日たつと自動的に完全削除されます。</p>
      {trashed.map((n) => {
        const daysLeft = Math.max(0, Math.ceil((n.updatedAt + TRASH_RETENTION_MS - Date.now()) / (24 * 60 * 60 * 1000)));
        return (
          <div key={n.id} className="card trash-card">
            {n.body.trim() !== "" && <div className="card-title">{firstLineTitle(n.body)}</div>}
            <CardThumbs noteId={n.id} />
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
