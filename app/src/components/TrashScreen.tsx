import { useLiveQuery } from "dexie-react-hooks";
import { accentClassFor } from "../lib/colors";
import { listTrashedFolders } from "../lib/folders";
import { firstLineTitle } from "../lib/markdown";
import { TRASH_RETENTION_MS, listTrashedNotes } from "../lib/notes";
import type { Folder, Note } from "../lib/types";
import { BackIcon, FolderIcon } from "./icons";
import { CardThumbs } from "./NoteList";

type Props = {
  syncBar: React.ReactNode;
  // 画面切替（list/note/settings/trash）のスライドインクラス（slide-in-left/right）。ルート要素(.screen)に直接付ける
  slideClass: string;
  onBack: () => void;
  // 復元操作。App側でundo登録（再softDelete/deleteFolderWithContents）・同期スケジュールまで面倒を見る
  onRestoreNote: (id: string) => void;
  onRestoreFolder: (id: string) => void;
};

// メモ・フォルダを新しい順（updatedAt降順）に混在表示するための行
type TrashRow = { kind: "note"; item: Note } | { kind: "folder"; item: Folder };

export function TrashScreen({ syncBar, slideClass, onBack, onRestoreNote, onRestoreFolder }: Props) {
  const trashedNotes = useLiveQuery(listTrashedNotes, [], []);
  const trashedFolders = useLiveQuery(listTrashedFolders, [], []);
  const rows: TrashRow[] = [
    ...trashedNotes.map((item): TrashRow => ({ kind: "note", item })),
    ...trashedFolders.map((item): TrashRow => ({ kind: "folder", item })),
  ].sort((a, b) => b.item.updatedAt - a.item.updatedAt);

  return (
    <div className={`trash screen ${slideClass}`}>
      <div className="list-header">
        {syncBar}
        <div className="toolbar">
          <button className="icon-btn" onClick={onBack} aria-label="戻る">
            <BackIcon />
          </button>
          <h2>ゴミ箱</h2>
        </div>
      </div>
      <div className="screen-body">
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
                <div className={`trash-folder-title ${accentClassFor(f.name)}`}>
                  <FolderIcon size={14} className="folder-icon" />
                  <span>{f.name}</span>
                  <span className="trash-kind">フォルダ</span>
                </div>
                <div className="card-sub">
                  削除: {new Date(f.updatedAt).toLocaleString("ja-JP")} / 残り{daysLeft}日
                </div>
                <button className="tint acc-green" onClick={() => onRestoreFolder(f.id)}>
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
              <button className="tint acc-green" onClick={() => onRestoreNote(n.id)}>
                復元
              </button>
            </div>
          );
        })}
        {rows.length === 0 && <p className="empty">ゴミ箱は空です</p>}
      </div>
    </div>
  );
}
