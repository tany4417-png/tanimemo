import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { BellIcon } from "./icons";

// リマインダーの仮想フォルダカード。フォルダ一覧ルートの最上部に置き、タップで通知一覧
// （RemindersScreen）へ遷移する。実フォルダではないためスワイプ削除・D&D・並べ替えの対象外
// （SwipeableCardは使わない）。リマインダー付きメモが無ければ自ら非表示になる
export function ReminderFolderCard({ onOpen }: { onOpen: () => void }) {
  const stats = useLiveQuery(
    async () => ({
      count: (await db.notes.filter((n) => n.deleted === 0 && n.remindAt != null).toArray()).length,
      unread: await db.unread.count(),
    }),
    [],
    null
  );
  if (!stats || stats.count === 0) return null;
  return (
    <div className="card folder-card reminder-folder" role="button" tabIndex={0} onClick={onOpen}>
      <BellIcon size={14} className="folder-icon" />
      <span className="folder-name">リマインダー</span>
      {stats.unread > 0 && <span className="unread-badge">{stats.unread}</span>}
      <span className="folder-count">{stats.count}件</span>
    </div>
  );
}
