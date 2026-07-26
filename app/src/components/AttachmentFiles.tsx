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
  // id→blob URLの単一の真実。stateではなくrefで持つ（2026-07-26 レビュー指摘の後退修正）。
  // useLiveQueryはDBに書き込みがあるたびに内容が同じでも新しい配列を返すため、以前はmetas依存の
  // effectが再実行されるたびにキャッシュ済み分を無条件でcreateObjectURLし直しており、
  // 「作ったが使われないURL」がrevokeされずに積み上がっていた（添付追加・削除・同期のたびに発生）。
  // ここに一本化し「既にurlMapにあるidはスキップ」「metasから消えたidはrevokeして消す」ことで
  // 二重生成・revoke漏れの両方を防ぐ。tickは再描画のトリガーとしてのみ使う（値は読まない）
  const urlMap = useRef<Map<string, string>>(new Map());
  // 直近のmetasに含まれるid集合。ensureUrl（押下時取得）が完了した時点で既に添付が消えていた
  // 場合に、使われないURLをrevokeするかの判定に使う
  const currentIdsRef = useRef<Set<string>>(new Set());
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  const [fetchingIds, setFetchingIds] = useState<Set<string>>(new Set());
  // 同じidへの「開く」「保存」の連打でgetImageBlobを二重に走らせないための進行中Promise
  const inFlight = useRef<Record<string, Promise<string | null> | undefined>>({});

  useEffect(() => {
    let cancelled = false;
    currentIdsRef.current = new Set(metas.map((m) => m.id));

    // metasから消えたid（削除・他端末での置き換え等）のURLはここで確実にrevokeする
    let removed = false;
    for (const [id, url] of urlMap.current) {
      if (!currentIdsRef.current.has(id)) {
        URL.revokeObjectURL(url);
        urlMap.current.delete(id);
        removed = true;
      }
    }
    if (removed) rerender();

    // ローカルキャッシュ（attachmentBlobs）にあり、かつまだurlMapに無いidだけ新規にurl化する。
    // 既にurlMapにあるidはスキップするので、metas再発火（内容不変でも配列参照が変わる）のたびに
    // 同じ添付を二重にcreateObjectURLすることはない。無い分はここでは何もしない＝
    // ネットワークには一切出ない（押下時のensureUrlに任せる）
    void (async () => {
      for (const m of metas) {
        if (cancelled) return;
        if (urlMap.current.has(m.id)) continue;
        const rec = await db.attachmentBlobs.get(m.id);
        if (cancelled || urlMap.current.has(m.id)) continue;
        if (rec) {
          const u = URL.createObjectURL(rec.blob);
          urlMap.current.set(m.id, u);
          rerender();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [metas]);

  // アンマウント時に残っている全blob URLをrevokeする。urlMap自体は入れ替わらない（常に同じ
  // Mapを書き換える）が、cleanup内で直接ref.currentを読むとlintが「DOM refと同様に読み出し時点で
  // 変わりうる」と警告するため、effect本体でローカル変数にコピーしてから使う
  useEffect(() => {
    const map = urlMap.current;
    return () => {
      for (const url of map.values()) URL.revokeObjectURL(url);
      map.clear();
    };
  }, []);

  if (metas.length === 0) return null;

  async function ensureUrl(id: string): Promise<string | null> {
    const existing = urlMap.current.get(id);
    if (existing) return existing;
    if (inFlight.current[id]) return inFlight.current[id];
    const p = (async () => {
      setFetchingIds((s) => new Set(s).add(id));
      try {
        const token = localStorage.getItem("tanimemo.token") ?? "";
        const blob = await getImageBlob(id, token);
        if (!blob) return null;
        const already = urlMap.current.get(id);
        if (already) return already; // 待っている間に別経路（cache-scan）で既に入っていた
        const u = URL.createObjectURL(blob);
        if (!currentIdsRef.current.has(id)) {
          // 取得を待っている間にこの添付がmetasから消えていた（削除等）。使われないURLを
          // 溜めずその場でrevokeする
          URL.revokeObjectURL(u);
          return null;
        }
        urlMap.current.set(id, u);
        rerender();
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
        const url = urlMap.current.get(m.id);
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
