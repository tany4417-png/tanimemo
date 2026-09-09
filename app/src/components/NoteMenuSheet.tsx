import { BellIcon, CheckIcon, ClipIcon, CopyIcon, FolderIcon, ImageIcon, TrashIcon } from "./icons";

type Props = {
  // 同期状態・グローバルundo/redo・同期・設定（App側から渡ってくる既存のバーをそのまま入れる）
  syncBar: React.ReactNode;
  importance: number;
  reminderOn: boolean;
  copyState: "idle" | "ok" | "ng";
  onImportance: (v: 0 | 1 | 2 | 3) => void;
  onPickImage: () => void;
  onPickFile: () => void;
  onReminder: () => void;
  onMove: () => void;
  onCopy: () => void;
  onDelete: () => void;
};

// メモ画面ヘッダーの「その他の操作」。1行ヘッダーに載せなかった操作をここへ集める。
// 押した結果を見せたいもの（★・全文コピー）だけはメニューを開いたままにする
export function NoteMenuSheet({
  syncBar, importance, reminderOn, copyState,
  onImportance, onPickImage, onPickFile, onReminder, onMove, onCopy, onDelete,
}: Props) {
  const copyLabel = copyState === "ok" ? "コピーしました" : copyState === "ng" ? "コピーできませんでした" : "全文をコピー";
  return (
    <div className="note-menu" role="menu">
      <div className="note-menu-sync">{syncBar}</div>
      <div className="note-menu-stars">
        <span className="stars">
          {[1, 2, 3].map((i) => (
            <button
              key={i}
              className={importance >= i ? "star on" : "star"}
              aria-label={`重要度${i}`}
              onClick={() => onImportance((importance === i ? i - 1 : i) as 0 | 1 | 2 | 3)}
            >
              ★
            </button>
          ))}
        </span>
      </div>
      <button className="note-menu-item" aria-label="写真を添付" onClick={onPickImage}>
        <ImageIcon size={18} />写真を追加
      </button>
      <button className="note-menu-item" aria-label="ファイルを添付" onClick={onPickFile}>
        <ClipIcon size={18} />ファイルを追加
      </button>
      <button className={reminderOn ? "note-menu-item accent" : "note-menu-item"} onClick={onReminder}>
        <BellIcon size={18} />リマインダー
      </button>
      <button className="note-menu-item" onClick={onMove}>
        <FolderIcon size={18} />移動…
      </button>
      <button className={copyState === "ok" ? "note-menu-item accent" : "note-menu-item"} aria-label={copyLabel} onClick={onCopy}>
        {copyState === "ok" ? <CheckIcon size={18} /> : <CopyIcon size={18} />}全文をコピー
      </button>
      <button className="note-menu-item danger-text" onClick={onDelete}>
        <TrashIcon size={18} />削除
      </button>
    </div>
  );
}
