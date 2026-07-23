import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { firstLineTitle } from "../lib/markdown";
import { BellIcon } from "./icons";

// ルートカードに出すタイトルの最大数。多い分は「ほか N件」に畳む（2026-07-24 オーナー要望:
// リマインダーの中身を最初のページでタイトルだけ小さく見たい）
const MAX_TITLES = 3;

// リマインダーの仮想フォルダカード。フォルダ一覧ルートの最上部に置き、タップで通知一覧
// （RemindersScreen）へ遷移する。実フォルダではないためスワイプ削除・D&D・並べ替えの対象外
// （SwipeableCardは使わない）。リマインダー付きメモが無ければ自ら非表示になる
export function ReminderFolderCard({ onOpen }: { onOpen: () => void }) {
  const stats = useLiveQuery(
    async () => {
      const all = await db.notes.filter((n) => n.deleted === 0 && n.remindAt != null).toArray();
      // 次に鳴る順（未来を昇順）。発火済みの過去は新しい順で末尾（RemindersScreenの並びと同じ思想）
      const now = Date.now();
      const future = all.filter((n) => n.remindAt! >= now).sort((a, b) => a.remindAt! - b.remindAt!);
      const past = all.filter((n) => n.remindAt! < now).sort((a, b) => b.remindAt! - a.remindAt!);
      const top = [...future, ...past].slice(0, MAX_TITLES).map((n) => ({ id: n.id, title: firstLineTitle(n.body) }));
      return { count: all.length, unread: await db.unread.count(), top };
    },
    [],
    null
  );
  if (!stats || stats.count === 0) return null;
  return (
    <div className="card folder-card reminder-folder" role="button" tabIndex={0} onClick={onOpen}>
      <div className="reminder-folder-head">
        <BellIcon size={14} className="folder-icon" />
        <span className="folder-name">リマインダー</span>
        {stats.unread > 0 && <span className="unread-badge">{stats.unread}</span>}
        <span className="folder-count">{stats.count}件</span>
      </div>
      <ul className="reminder-titles">
        {stats.top.map((t) => (
          <li key={t.id}>{t.title}</li>
        ))}
        {stats.count > MAX_TITLES && <li className="reminder-more">ほか {stats.count - MAX_TITLES}件</li>}
      </ul>
    </div>
  );
}
