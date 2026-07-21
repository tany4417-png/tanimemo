import { RedoIcon, SettingsIcon, SyncIcon, UndoIcon } from "./icons";

type Props = {
  status: "idle" | "syncing" | "offline" | "error";
  pending: number;
  lastSync: number | null;
  // グローバルundo/redo（削除・移動・並べ替え・内容変更の操作履歴）。編集モード中のテキストundo/redo
  // （NoteScreen内の既存ボタン）とは別系統＝編集中はテキスト用、それ以外はここの操作用という分担
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSync: () => void;
  onSettings: () => void;
};

export function SyncStatus({ status, pending, lastSync, canUndo, canRedo, onUndo, onRedo, onSync, onSettings }: Props) {
  const label = { idle: "同期済み", syncing: "同期中…", offline: "オフライン", error: "同期エラー" }[status];
  const time = lastSync ? new Date(lastSync).toLocaleTimeString("ja-JP") : "未同期";
  return (
    <div className="syncbar">
      <span className={`dot ${status}`} />
      <span>
        {label}（{time}）{pending > 0 ? ` 未送信${pending}件` : ""}
      </span>
      <span className="spacer" />
      <button className="icon-btn" aria-label="操作を取り消し" disabled={!canUndo} onClick={onUndo}>
        <UndoIcon size={14} />
      </button>
      <button className="icon-btn" aria-label="操作をやり直し" disabled={!canRedo} onClick={onRedo}>
        <RedoIcon size={14} />
      </button>
      <button className="tint acc-blue" onClick={onSync} disabled={status === "syncing"}>
        <SyncIcon size={14} />
        同期
      </button>
      <button onClick={onSettings}>
        <SettingsIcon size={14} />
        設定
      </button>
    </div>
  );
}
