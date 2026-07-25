import { extLabel, fallbackName, formatSize } from "../lib/attachment-view";
import { CloseIcon, DownloadIcon, FileIcon } from "./icons";
import { useAttachmentUrls } from "./useAttachmentUrls";

// 非画像添付の行リスト。開く＝新しいタブ（PCはブラウザ内蔵ビューア）、保存＝download属性でOSに渡す。
// blob URLの後始末はuseAttachmentUrlsのcleanupに任せる
export function AttachmentFiles({
  noteId,
  showDelete,
  onDeleteAttachment,
}: {
  noteId: string;
  showDelete?: boolean;
  onDeleteAttachment?: (attId: string) => void;
}) {
  const { metas, urls } = useAttachmentUrls(noteId, undefined, { kind: "file" });
  if (metas.length === 0) return null;
  return (
    <div className="att-files">
      {metas.map((m) => {
        const name = m.name ?? fallbackName(m.mime, m.createdAt);
        const url = urls[m.id];
        return (
          <div key={m.id} className="att-file">
            <FileIcon size={18} className="att-file-icon" />
            <span className="att-file-ext">{extLabel(m.name, m.mime)}</span>
            <span className="att-file-name">{name}</span>
            <span className="att-file-size">{formatSize(m.size)}</span>
            {url && (
              <a className="att-file-btn" href={url} target="_blank" rel="noopener" aria-label={`${name}を開く`}>
                開く
              </a>
            )}
            {url && (
              <a className="att-file-btn icon" href={url} download={name} aria-label={`${name}を保存`}>
                <DownloadIcon size={16} />
              </a>
            )}
            {showDelete && onDeleteAttachment && (
              <button className="att-file-btn icon" aria-label="このファイルを削除" onClick={() => onDeleteAttachment(m.id)}>
                <CloseIcon size={14} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
