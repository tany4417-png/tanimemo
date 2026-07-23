import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { deriveReminderInfo } from "../lib/reminder-label";
import { CardThumbs } from "./CardThumbs";
import { BackIcon } from "./icons";
import { SwipeableCard } from "./SwipeableCard";

type Props = {
  syncBar: React.ReactNode;
  // 画面切替のスライドインクラス（slide-in-left/right）。ルート要素(.screen)に直接付ける
  slideClass: string;
  onOpenNote: (id: string) => void;
  onBack: () => void;
  // 「新規」＝通知付きメモの作成。App側で新規メモを開き、リマインダーシートを開いた状態で始める
  onCreate: () => void;
  // 行のスワイプ削除（メモのゴミ箱行き）。App側でundo登録まで面倒を見る（NoteListと同じ経路）
  onDelete: (id: string) => void;
};

// リマインダー一覧。deleted=0かつremindAt!=nullのメモを次回発火時刻の昇順で表示する。
// 発火済み（単発の24時間超過）は末尾へ回し、行に"fired"クラスを付けて減光する。
// 行はNoteListと同じSwipeableCard（タップで開く・スワイプで削除・未読は赤点）
export function RemindersScreen({ syncBar, slideClass, onOpenNote, onBack, onCreate, onDelete }: Props) {
  // スワイプで削除ボタンが開いている行のid（NoteListと同じcontrolledパターン・開けるのは同時に1枚だけ）
  const [openId, setOpenId] = useState<string | null>(null);
  // 通知未読のメモid集合。行の赤点表示用（NoteListのカード赤点と同じ見た目）
  const unreadIds = useLiveQuery(
    async () => new Set((await db.unread.toArray()).map((u) => u.noteId)),
    [],
    new Set<string>()
  );
  const rows = useLiveQuery(async () => {
    const now = Date.now();
    const notes = await db.notes.filter((n) => n.deleted === 0 && n.remindAt != null).toArray();
    return notes
      .map((n) => {
        const info = deriveReminderInfo(n.remindAt, n.repeatRule, now);
        return {
          id: n.id,
          // 本文が空（画像のみ等）なら空のまま。仮タイトル「メモ」は出さずサムネに任せる
          title: n.body.split("\n")[0].slice(0, 60),
          fired: info.fired,
          shown: info.next ?? n.remindAt!,
          label: info.label,
        };
      })
      .sort((a, b) => (a.fired !== b.fired ? (a.fired ? 1 : -1) : a.shown - b.shown));
  }, [], []);

  return (
    <div className={`reminders screen ${slideClass}`}>
      <div className="list-header">
        {syncBar}
        <div className="toolbar">
          <button className="icon-btn" aria-label="戻る" onClick={onBack}>
            <BackIcon />
          </button>
          <h2>リマインダー</h2>
          <button className="primary" onClick={onCreate}>新規</button>
        </div>
      </div>
      <div className="screen-body">
        <div className="bounce-area">
          {rows.length === 0 && <p className="empty">通知を設定したメモはありません</p>}
          {rows.map((r) => (
            <SwipeableCard
              key={r.id}
              isOpen={openId === r.id}
              onOpenChange={(open) => setOpenId(open ? r.id : null)}
              onCloseOthers={() => setOpenId((cur) => (cur === r.id ? cur : null))}
              onDelete={() => {
                onDelete(r.id);
                setOpenId((cur) => (cur === r.id ? null : cur));
              }}
              onOpen={() => onOpenNote(r.id)}
              className={r.fired ? "reminder-row fired" : "reminder-row"}
            >
              <div className="reminder-row-main">
                {unreadIds.has(r.id) && <span className="unread-dot" aria-label="未読の通知" />}
                <span className="reminder-title">{r.title}</span>
                <span className="reminder-when">{r.label}</span>
              </div>
              {/* 画像のみのメモでも中身がわかるよう、NoteListのカードと同じサムネイルを出す */}
              <CardThumbs noteId={r.id} />
            </SwipeableCard>
          ))}
        </div>
      </div>
    </div>
  );
}
