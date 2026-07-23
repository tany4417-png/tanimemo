import { db } from "./db";

// アプリアイコンの数字バッジ（Badging API・iOS 16.4+のPWA等）。未対応環境・権限なしはno-op。
// navigatorはウィンドウとSWの両方でグローバル解決されるため、このモジュールはsw.tsからも使える
async function updateAppBadge(count: number): Promise<void> {
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count > 0) await nav.setAppBadge?.(count);
    else await nav.clearAppBadge?.();
  } catch {
    // バッジは補助表示。失敗で本処理（通知表示・未読記録）を巻き込まない
  }
}

// アイコンバッジを未読の実数に合わせる（起動・復帰時、SWが別コンテキストで積んだ分の反映）
export async function syncAppBadge(): Promise<void> {
  await updateAppBadge(await db.unread.count());
}

// push受信時（SWから呼ぶ）: 未読を積んでバッジ更新。putはupsertなので同一メモの再通知は1件のまま
export async function markUnread(noteId: string): Promise<void> {
  await db.unread.put({ noteId, firedAt: Date.now() });
  await syncAppBadge();
}

// メモを開いた時: 未読を解除してバッジ更新（未読が無いメモでもdeleteは冪等）
export async function clearUnread(noteId: string): Promise<void> {
  await db.unread.delete(noteId);
  await syncAppBadge();
}

// 起動時の掃除: 対応するメモが消えた・ゴミ箱行きの未読を除去する。
// 削除経路（スワイプ削除・フォルダごと削除・他端末の削除の同期）でclearUnreadを呼び漏れても自己修復する
export async function pruneUnread(): Promise<void> {
  const rows = await db.unread.toArray();
  for (const r of rows) {
    const n = await db.notes.get(r.noteId);
    if (!n || n.deleted !== 0) await db.unread.delete(r.noteId);
  }
  await syncAppBadge();
}
