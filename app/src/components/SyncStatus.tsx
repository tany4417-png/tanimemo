import { SettingsIcon, SyncIcon } from "./icons";

type Props = {
  status: "idle" | "syncing" | "offline" | "error";
  pending: number;
  lastSync: number | null;
  onSync: () => void;
  onSettings: () => void;
};

export function SyncStatus({ status, pending, lastSync, onSync, onSettings }: Props) {
  const label = { idle: "同期済み", syncing: "同期中…", offline: "オフライン", error: "同期エラー" }[status];
  const time = lastSync ? new Date(lastSync).toLocaleTimeString("ja-JP") : "未同期";
  return (
    <div className="syncbar">
      <span className={`dot ${status}`} />
      <span>
        {label}（{time}）{pending > 0 ? ` 未送信${pending}件` : ""}
      </span>
      <span className="spacer" />
      <button onClick={onSync} disabled={status === "syncing"}>
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
