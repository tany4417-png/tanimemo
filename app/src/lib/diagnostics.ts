import { db } from "./db";

export type Diagnostics = {
  version: string;
  lastSync: number | null;
  fullResyncDone: boolean;
  notes: { total: number; trashCount: number; dirty: number };
  folders: { total: number; dirty: number };
  attachments: { metaCount: number; dirty: number; blobCount: number };
};

// 設定画面の「同期の診断」パネル用データ集計。ローカルDB（Dexie）の件数を読むだけで、サーバーへは問い合わせない。
// notes.totalはゴミ箱を除いた有効メモ数（deleted=0）で、ゴミ箱数は別項目にする。
// folders/attachmentsはブリーフでゴミ箱数の内訳が要求されていないため、deletedを問わず全行数を「総数」とする
export async function collectDiagnostics(): Promise<Diagnostics> {
  const [allNotes, allFolders, allAttachments, blobCount, lastSyncRow, fullResyncRow] = await Promise.all([
    db.notes.toArray(),
    db.folders.toArray(),
    db.attachments.toArray(),
    db.attachmentBlobs.count(),
    db.meta.get("lastSync"),
    db.meta.get("fullResyncV3"),
  ]);

  return {
    version: __APP_VERSION__,
    lastSync: typeof lastSyncRow?.value === "number" ? lastSyncRow.value : null,
    fullResyncDone: fullResyncRow !== undefined,
    notes: {
      total: allNotes.filter((n) => n.deleted === 0).length,
      trashCount: allNotes.filter((n) => n.deleted === 1).length,
      dirty: allNotes.filter((n) => n.dirty === 1).length,
    },
    folders: {
      total: allFolders.length,
      dirty: allFolders.filter((f) => f.dirty === 1).length,
    },
    attachments: {
      metaCount: allAttachments.length,
      dirty: allAttachments.filter((a) => a.dirty === 1).length,
      blobCount,
    },
  };
}
