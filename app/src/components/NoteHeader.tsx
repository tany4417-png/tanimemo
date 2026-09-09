import { BackIcon, MoreIcon, RedoIcon, UndoIcon } from "./icons";

type Props = {
  // 本文1行目。空メモでは空文字が来る
  title: string;
  editing: boolean;
  // スクロールで画面外へ追い出されている間はtrue（要素自体は残す）
  hidden: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onBack: () => void;
  onEdit: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onFinish: () => void;
  onMenu: () => void;
};

// メモ画面の上部1行。本文の面積を稼ぐのが目的なので、ここに操作を足すときは1行に収まるかを先に確かめる。
// 編集中の操作（取り消し・やり直し・完了）もここへ置く。キーボードの上に置くとiOSが画面ごと
// 動かしにいって位置が飛ぶため、画面の上端に留めるほうが素直に動く
export function NoteHeader({
  title, editing, hidden, canUndo, canRedo, onBack, onEdit, onUndo, onRedo, onFinish, onMenu,
}: Props) {
  return (
    <div className={hidden ? "note-header hidden" : "note-header"}>
      <button className="icon-btn" onClick={onBack} aria-label="戻る">
        <BackIcon />
      </button>
      <span className="note-header-title">{title}</span>
      {editing ? (
        <>
          <button className="icon-btn" aria-label="取り消し" disabled={!canUndo} onClick={onUndo}>
            <UndoIcon />
          </button>
          <button className="icon-btn" aria-label="やり直し" disabled={!canRedo} onClick={onRedo}>
            <RedoIcon />
          </button>
          <button className="primary" onClick={onFinish}>完了</button>
        </>
      ) : (
        <button className="tint acc-amber" onClick={onEdit}>編集</button>
      )}
      <button className="icon-btn" aria-label="その他の操作" onClick={onMenu}>
        <MoreIcon />
      </button>
    </div>
  );
}
