import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { extLabel, fallbackName, formatSize, isImageMime } from "../lib/attachment-view";
import { getImageBlob } from "../lib/attachments";
import { db } from "../lib/db";
import type { AttachmentMeta } from "../lib/types";
import { CloseIcon, DownloadIcon, FileIcon } from "./icons";

// 非画像添付の行リスト。開く＝新しいタブ（PCはブラウザ内蔵ビューア）、保存＝download属性でOSに渡す。
//
// Gallery/CardThumbsが使うuseAttachmentUrlsとは違い、ここでは行を描画した時点での先読みをしない
// （2026-07-26 実バグ: 50MBのカタログPDFが3本ぶら下がったメモを他端末で開くと、ユーザーが
// 「開く」を押していないのに150MBを回線から引いてメモリに載せていた）。ローカルにキャッシュ済み
// （attachmentBlobs）の分だけ即座にURL化し、無い分は「開く」「保存」を押した瞬間にgetImageBlobで
// 取りに行ってからアンカーを起動する。blob URLの後始末（revoke）はこのコンポーネントで完結させる
export function AttachmentFiles({
  noteId,
  showDelete,
  onDeleteAttachment,
}: {
  noteId: string;
  showDelete?: boolean;
  onDeleteAttachment?: (attId: string) => void;
}) {
  const metas = useLiveQuery(
    async () =>
      (await db.attachments.where("noteId").equals(noteId).filter((a) => a.deleted === 0).toArray()).filter(
        (a) => !isImageMime(a.mime)
      ),
    [noteId],
    [] as AttachmentMeta[]
  );
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [fetchingIds, setFetchingIds] = useState<Set<string>>(new Set());
  // このコンポーネントが作った全blob URL。アンマウント時にまとめてrevokeする
  const createdUrls = useRef<string[]>([]);
  // 同じidへの「開く」「保存」の連打でgetImageBlobを二重に走らせないための進行中Promise
  const inFlight = useRef<Record<string, Promise<string | null> | undefined>>({});

  // ローカルキャッシュ（attachmentBlobs）にある分だけ即url化する。無い分はここでは何もしない＝
  // ネットワークには一切出ない（押下時のensureUrlに任せる）
  useEffect(() => {
    let alive = true;
    void (async () => {
      const next: Record<string, string> = {};
      for (const m of metas) {
        const rec = await db.attachmentBlobs.get(m.id);
        if (rec) {
          const u = URL.createObjectURL(rec.blob);
          createdUrls.current.push(u);
          next[m.id] = u;
        }
      }
      // オンデマンド取得済み（cur）を優先し、キャッシュ再走査で上書きしない
      if (alive) setUrls((cur) => ({ ...next, ...cur }));
    })();
    return () => {
      alive = false;
    };
  }, [metas]);

  useEffect(() => {
    return () => {
      createdUrls.current.forEach((u) => URL.revokeObjectURL(u));
      createdUrls.current = [];
    };
  }, []);

  if (metas.length === 0) return null;

  async function ensureUrl(id: string): Promise<string | null> {
    if (urls[id]) return urls[id];
    if (inFlight.current[id]) return inFlight.current[id];
    const p = (async () => {
      setFetchingIds((s) => new Set(s).add(id));
      try {
        const token = localStorage.getItem("tanimemo.token") ?? "";
        const blob = await getImageBlob(id, token);
        if (!blob) return null;
        const u = URL.createObjectURL(blob);
        createdUrls.current.push(u);
        setUrls((cur) => ({ ...cur, [id]: u }));
        return u;
      } finally {
        setFetchingIds((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
        delete inFlight.current[id];
      }
    })();
    inFlight.current[id] = p;
    return p;
  }

  async function handleOpen(id: string, name: string) {
    const u = await ensureUrl(id);
    if (!u) {
      alert(`${name}を取得できませんでした`);
      return;
    }
    const a = document.createElement("a");
    a.href = u;
    a.target = "_blank";
    a.rel = "noopener";
    a.click();
  }

  async function handleSave(id: string, name: string) {
    const u = await ensureUrl(id);
    if (!u) {
      alert(`${name}を取得できませんでした`);
      return;
    }
    const a = document.createElement("a");
    a.href = u;
    a.download = name;
    a.click();
  }

  return (
    <div className="att-files">
      {metas.map((m) => {
        const name = m.name ?? fallbackName(m.mime, m.createdAt);
        const url = urls[m.id];
        const fetching = fetchingIds.has(m.id);
        return (
          <div key={m.id} className="att-file">
            <FileIcon size={18} className="att-file-icon" />
            <span className="att-file-ext">{extLabel(m.name, m.mime)}</span>
            <span className="att-file-name">{name}</span>
            <span className="att-file-size">{formatSize(m.size)}</span>
            {url ? (
              <a className="att-file-btn" href={url} target="_blank" rel="noopener" aria-label={`${name}を開く`}>
                開く
              </a>
            ) : (
              <button
                className="att-file-btn"
                disabled={fetching}
                aria-label={`${name}を開く`}
                onClick={() => void handleOpen(m.id, name)}
              >
                {fetching ? "取得中…" : "開く"}
              </button>
            )}
            {url ? (
              <a className="att-file-btn icon" href={url} download={name} aria-label={`${name}を保存`}>
                <DownloadIcon size={16} />
              </a>
            ) : (
              <button
                className="att-file-btn icon"
                disabled={fetching}
                aria-label={fetching ? "取得中" : `${name}を保存`}
                onClick={() => void handleSave(m.id, name)}
              >
                <DownloadIcon size={16} />
              </button>
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
