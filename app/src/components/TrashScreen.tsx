import { useLiveQuery } from "dexie-react-hooks";
import { listTrashedFolders, restoreFolderWithContents } from "../lib/folders";
import { firstLineTitle } from "../lib/markdown";
import { TRASH_RETENTION_MS, listTrashedNotes, restoreNote } from "../lib/notes";
import type { Folder, Note } from "../lib/types";
import { BackIcon, FolderIcon } from "./icons";
import { CardThumbs } from "./NoteList";

type Props = { syncBar: React.ReactNode; onBack: () => void; onRestored: () => void };

// メモ・フォルダを新しい順（updatedAt降順）に混在表示するための行
type TrashRow = { kind: "note"; item: Note } | { kind: "folder"; item: Folder };

export function TrashScreen({ syncBar, onBack, onRestored }: Props) {
  const trashedNotes = useLiveQuery(listTrashedNotes, [], []);
  const trashedFolders = useLiveQuery(listTrashedFolders, [], []);
  const rows: TrashRow[] = [
    ...trashedNotes.map((item): TrashRow => ({ kind: "note", item })),
    ...trashedFolders.map((item): TrashRow => ({ kind: "folder", item })),
  ].sort((a, b) => b.item.updatedAt - a.item.updatedAt);

  return (
    <div className="trash">
      <div className="list-header">
        {syncBar}
        <div className="toolbar">
          <button className="icon-btn" onClick={onBack} aria-label="戻る">
            <BackIcon />
          </button>
          <h2>ゴミ箱</h2>
        </div>
      </div>
      <p className="trash-note">削除から30日たつと自動的に完全削除されます。</p>
      {rows.map((row) => {
        const daysLeft = Math.max(
          0,
          Math.ceil((row.item.updatedAt + TRASH_RETENTION_MS - Date.now()) / (24 * 60 * 60 * 1000))
        );
        if (row.kind === "folder") {
          const f = row.item;
          return (
            <div key={f.id} className="card trash-card">
              <div className="trash-folder-title">
                <FolderIcon size={14} className="folder-icon" />
                <span>{f.name}</span>
                <span className="trash-kind">フォルダ</span>
              </div>
              <div className="card-sub">
                削除: {new Date(f.updatedAt).toLocaleString("ja-JP")} / 残り{daysLeft}日
              </div>
              <button
                onClick={async () => {
                  await restoreFolderWithContents(f.id);
                  onRestored();
                }}
              >
                復元
              </button>
            </div>
          );
        }
        const n = row.item;
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
      {rows.length === 0 && <p className="empty">ゴミ箱は空です</p>}
    </div>
  );
}
