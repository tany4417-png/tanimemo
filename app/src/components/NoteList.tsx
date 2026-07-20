import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { listNotesIn } from "../lib/folders";
import { firstLineTitle, urlOnly } from "../lib/markdown";
import type { SortMode } from "../lib/sort";
import type { Folder, Note } from "../lib/types";
import { useAttachmentUrls } from "./useAttachmentUrls";

type Props = {
  notes: Note[];
  allTags: string[];
  sort: SortMode;
  onSort: (m: SortMode) => void;
  activeTags: string[];
  onToggleTag: (t: string) => void;
  query: string;
  onQuery: (q: string) => void;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  folderPath: Folder[];
  childFolders: Folder[];
  onOpenFolder: (id: string | null) => void;
  onCreateFolder: () => void;
  onRenameCurrentFolder: () => void;
  onDeleteFolder: (id: string) => void;
};

export function NoteList(p: Props) {
  // 検索・タグ絞り込み中はフォルダを横断して探すモード。パンくず・フォルダカード・フォルダ作成は隠す
  const isBrowsingFolder = p.query.trim() === "" && p.activeTags.length === 0;
  return (
    <div className="list">
      <div className="toolbar">
        <input className="search" placeholder="検索" value={p.query} onChange={(e) => p.onQuery(e.target.value)} />
        <select value={p.sort} onChange={(e) => p.onSort(e.target.value as SortMode)}>
          <option value="created">新しい順</option>
          <option value="updated">更新順</option>
          <option value="importance">重要度順</option>
        </select>
        {isBrowsingFolder && <button onClick={p.onCreateFolder}>フォルダ＋</button>}
        <button className="primary" onClick={p.onCreate}>新規</button>
      </div>
      {isBrowsingFolder && (
        <Breadcrumb path={p.folderPath} onNavigate={p.onOpenFolder} onRenameCurrent={p.onRenameCurrentFolder} />
      )}
      <div className="tagbar">
        {p.allTags.map((t) => (
          <button key={t} className={p.activeTags.includes(t) ? "tag active" : "tag"} onClick={() => p.onToggleTag(t)}>
            {t}
          </button>
        ))}
      </div>
      {isBrowsingFolder &&
        p.childFolders.map((f) => (
          <FolderCard key={f.id} folder={f} onOpen={() => p.onOpenFolder(f.id)} onDelete={() => p.onDeleteFolder(f.id)} />
        ))}
      {p.notes.map((n) => (
        <SwipeableCard key={n.id} onDelete={() => p.onDelete(n.id)} onOpen={() => p.onOpen(n.id)}>
          <div className="card-title">
            {n.importance > 0 && <span className="card-stars">{"★".repeat(n.importance)}</span>}
            {(() => {
              const url = urlOnly(n.body);
              return url ? (
                <a className="card-link" href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                  {url}
                </a>
              ) : n.body.trim() === "" ? null : (
                firstLineTitle(n.body)
              );
            })()}
          </div>
          <CardThumbs noteId={n.id} />
          <div className="card-sub">
            {new Date(n.updatedAt).toLocaleString("ja-JP")} {n.tags.map((t) => `#${t}`).join(" ")}
          </div>
        </SwipeableCard>
      ))}
      {p.notes.length === 0 && <p className="empty">メモがありません</p>}
    </div>
  );
}

function Breadcrumb({
  path,
  onNavigate,
  onRenameCurrent,
}: {
  path: Folder[];
  onNavigate: (id: string | null) => void;
  onRenameCurrent: () => void;
}) {
  return (
    <div className="breadcrumb">
      <span className="crumb" onClick={() => onNavigate(null)}>
        すべてのメモ
      </span>
      {path.map((f, i) => (
        <span key={f.id}>
          <span className="crumb-sep"> &gt; </span>
          <span className="crumb" onClick={() => (i === path.length - 1 ? onRenameCurrent() : onNavigate(f.id))}>
            {f.name}
          </span>
        </span>
      ))}
    </div>
  );
}

function FolderCard({ folder, onOpen, onDelete }: { folder: Folder; onOpen: () => void; onDelete: () => void }) {
  const count = useLiveQuery(async () => (await listNotesIn(folder.id)).length, [folder.id], 0);
  return (
    <SwipeableCard onDelete={onDelete} onOpen={onOpen} className="folder-card">
      <span className="folder-icon">📁</span>
      <span className="folder-name">{folder.name}</span>
      <span className="folder-count">{count}件</span>
    </SwipeableCard>
  );
}

function SwipeableCard({
  onDelete,
  onOpen,
  className,
  children,
}: {
  onDelete: () => void;
  onOpen: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const [dx, setDx] = useState(0);
  // 判定はrefで行う（高速スワイプではstateの反映がpointerupに間に合わないため）
  const dxRef = useRef(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);

  function reset() {
    dxRef.current = 0;
    setDx(0);
    start.current = null;
    dragging.current = false;
  }
  return (
    <div className="swipe-wrap">
      <div className="swipe-bg">削除</div>
      <div
        className={className ? `card ${className}` : "card"}
        style={{ transform: `translateX(${dx}px)`, touchAction: "pan-y" }}
        onPointerDown={(e) => {
          start.current = { x: e.clientX, y: e.clientY };
          dragging.current = false;
          dxRef.current = 0;
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          const dxNow = e.clientX - start.current.x;
          const dyNow = e.clientY - start.current.y;
          // 誤爆防止: 開始は左24px以上かつ横成分が縦の1.5倍以上のときだけ
          if (!dragging.current && dxNow < -24 && Math.abs(dxNow) > 1.5 * Math.abs(dyNow)) {
            dragging.current = true;
            try {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            } catch {
              // 一部環境でcaptureできなくてもスワイプ自体は成立する
            }
          }
          if (dragging.current) {
            dxRef.current = Math.min(0, dxNow);
            setDx(dxRef.current);
          }
        }}
        onPointerUp={(e) => {
          const isLink = (e.target as HTMLElement).closest("a") !== null;
          if (dragging.current && dxRef.current < -120) onDelete();
          else if (!dragging.current && start.current && !isLink) onOpen();
          reset();
        }}
        onPointerCancel={reset}
      >
        {children}
      </div>
    </div>
  );
}

export function CardThumbs({ noteId }: { noteId: string }) {
  const { metas, urls } = useAttachmentUrls(noteId, 3);
  if (metas.length === 0) return null;
  return (
    <div className="card-thumbs">
      {metas.map((m) => urls[m.id] && <img key={m.id} className="card-thumb" src={urls[m.id]} alt="" />)}
    </div>
  );
}
