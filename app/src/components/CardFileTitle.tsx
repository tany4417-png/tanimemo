import { useLiveQuery } from "dexie-react-hooks";
import { fallbackName, isImageMime } from "../lib/attachment-view";
import { db } from "../lib/db";

// 本文が空でファイルだけ貼ったメモは、一覧では日付とクリップの件数しか出ず何のメモか分からない。
// タイトルの位置に添付ファイル名を出して見分けられるようにする。
// 画像だけのメモはサムネイルで判別できるので対象にしない（呼び出し側は本文が空のときだけ描画する）
export function CardFileTitle({ noteId }: { noteId: string }) {
  const names = useLiveQuery(
    async () =>
      (await db.attachments.where("noteId").equals(noteId).filter((a) => a.deleted === 0).toArray())
        .filter((a) => !isImageMime(a.mime))
        // nameを持たない旧データは表示のたびに導出する（保存はしない）
        .map((a) => a.name ?? fallbackName(a.mime, a.createdAt)),
    [noteId],
    [] as string[]
  );
  if (names.length === 0) return null;
  return (
    <span className="card-file-title">
      {names[0]}
      {names.length > 1 && <span className="card-file-more"> ほか{names.length - 1}件</span>}
    </span>
  );
}
