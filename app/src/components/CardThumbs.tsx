import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { isImageMime } from "../lib/attachment-view";
import { ClipIcon } from "./icons";
import { useAttachmentUrls } from "./useAttachmentUrls";

export function CardThumbs({ noteId }: { noteId: string }) {
  const { metas, urls } = useAttachmentUrls(noteId, 3, { thumb: true, kind: "image" });
  // 非画像は枚数だけ出す（サムネが作れないため）
  const fileCount = useLiveQuery(
    async () =>
      (await db.attachments.where("noteId").equals(noteId).filter((a) => a.deleted === 0).toArray())
        .filter((a) => !isImageMime(a.mime)).length,
    [noteId],
    0
  );
  if (metas.length === 0 && fileCount === 0) return null;
  return (
    <div className="card-thumbs">
      {metas.map(
        (m) =>
          urls[m.id] && (
            <img
              key={m.id}
              className={`card-thumb${m.id.startsWith("staffportrait") ? " staff-portrait" : ""}`}
              src={urls[m.id]}
              alt=""
            />
          )
      )}
      {fileCount > 0 && (
        <span className="card-files" aria-label={`添付ファイル${fileCount}件`}>
          <ClipIcon size={14} />
          {fileCount}
        </span>
      )}
    </div>
  );
}
