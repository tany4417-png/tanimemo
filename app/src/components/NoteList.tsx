import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { resolveDropTarget } from "../lib/dnd";
import { listNotesIn } from "../lib/folders";
import { firstLineTitle, urlOnly } from "../lib/markdown";
import type { SortMode } from "../lib/sort";
import type { Folder, Note } from "../lib/types";
import { FolderIcon, TrashIcon } from "./icons";
import { useAttachmentUrls } from "./useAttachmentUrls";

// カードの長押しドラッグが運ぶ荷物。noteはメモ本体、folderはフォルダそのものを表す
type DragPayload = { kind: "note"; id: string } | { kind: "folder"; id: string };

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
  // 検索・タグ絞り込み中はフォルダ横断表示になるモード。App側の判定を一本化して受け取る
  isBrowsingFolder: boolean;
  folderPath: Folder[];
  childFolders: Folder[];
  onOpenFolder: (id: string | null) => void;
  onCreateFolder: () => void;
  onRenameCurrentFolder: () => void;
  onDeleteFolder: (id: string) => void;
  onMoveNote: (noteId: string, folderId: string | null) => void;
  onMoveFolder: (id: string, parentId: string | null) => void;
};

export function NoteList(p: Props) {
  const isBrowsingFolder = p.isBrowsingFolder;
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
          <FolderCard
            key={f.id}
            folder={f}
            onOpen={() => p.onOpenFolder(f.id)}
            onDelete={() => p.onDeleteFolder(f.id)}
            onMoveNote={p.onMoveNote}
            onMoveFolder={p.onMoveFolder}
          />
        ))}
      {p.notes.map((n) => (
        <SwipeableCard
          key={n.id}
          onDelete={() => p.onDelete(n.id)}
          onOpen={() => p.onOpen(n.id)}
          // 絞り込み中はドロップ先（フォルダ/パンくず）が画面に無いため、ドラッグ自体を始めさせない
          dragPayload={isBrowsingFolder ? { kind: "note", id: n.id } : undefined}
          currentLocationId={n.folderId}
          onMoveNote={p.onMoveNote}
          onMoveFolder={p.onMoveFolder}
        >
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
      {p.notes.length === 0 && (
        <p className="empty">まだメモがありません。「新規」から書き始めるか、URLや画像を貼り付けてください。</p>
      )}
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
  const atRoot = path.length === 0;
  return (
    <div className="breadcrumb">
      {/* data-drop-folder: メモ・フォルダを上の階層へ戻すためのドロップ先。ルートは"root" */}
      <span className={atRoot ? "crumb crumb-current" : "crumb"} data-drop-folder="root" onClick={() => onNavigate(null)}>
        すべてのメモ
      </span>
      {path.map((f, i) => {
        const isCurrent = i === path.length - 1;
        return (
          <span key={f.id}>
            <span className="crumb-sep"> &gt; </span>
            <span
              className={isCurrent ? "crumb crumb-current" : "crumb"}
              data-drop-folder={f.id}
              onClick={() => (isCurrent ? onRenameCurrent() : onNavigate(f.id))}
            >
              {f.name}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function FolderCard({
  folder,
  onOpen,
  onDelete,
  onMoveNote,
  onMoveFolder,
}: {
  folder: Folder;
  onOpen: () => void;
  onDelete: () => void;
  onMoveNote: (noteId: string, folderId: string | null) => void;
  onMoveFolder: (id: string, parentId: string | null) => void;
}) {
  const count = useLiveQuery(async () => (await listNotesIn(folder.id)).length, [folder.id], 0);
  return (
    <SwipeableCard
      onDelete={onDelete}
      onOpen={onOpen}
      className="folder-card"
      dragPayload={{ kind: "folder", id: folder.id }}
      currentLocationId={folder.parentId}
      onMoveNote={onMoveNote}
      onMoveFolder={onMoveFolder}
    >
      <FolderIcon size={14} className="folder-icon" />
      <span className="folder-name">{folder.name}</span>
      <span className="folder-count">{count}件</span>
    </SwipeableCard>
  );
}

// 長押し（400ms静止）でドラッグモードに入るまでの猶予と、その間に許容する移動量
const PRESS_HOLD_MS = 400;
const PRESS_MOVE_CANCEL_PX = 12;

function SwipeableCard({
  onDelete,
  onOpen,
  className,
  children,
  dragPayload,
  currentLocationId,
  onMoveNote,
  onMoveFolder,
}: {
  onDelete: () => void;
  onOpen: () => void;
  className?: string;
  children: React.ReactNode;
  // 指定するとカード自体が長押しドラッグで移動できるようになる（メモ・フォルダ共通）
  dragPayload?: DragPayload;
  // ドラッグ対象の現在の置き場所（メモ→folderId、フォルダ→parentId）。ドロップ先と同じなら移動を無視する
  currentLocationId?: string | null;
  onMoveNote?: (noteId: string, folderId: string | null) => void;
  onMoveFolder?: (id: string, parentId: string | null) => void;
}) {
  const [dx, setDx] = useState(0);
  // 判定はrefで行う（高速スワイプではstateの反映がpointerupに間に合わないため）
  const dxRef = useRef(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false); // 左スワイプ（削除）判定

  const [isDragMode, setIsDragMode] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragModeRef = useRef(false); // 長押しドラッグ移動モード
  const pressTimer = useRef<number | undefined>(undefined);
  const pointerIdRef = useRef<number | null>(null);
  const dropTargetRef = useRef<Element | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const draggable = dragPayload !== undefined;

  function clearDropHighlight() {
    dropTargetRef.current?.classList.remove("drop-active");
    dropTargetRef.current = null;
  }

  function reset() {
    dxRef.current = 0;
    setDx(0);
    start.current = null;
    dragging.current = false;
    window.clearTimeout(pressTimer.current);
    pressTimer.current = undefined;
    dragModeRef.current = false;
    setIsDragMode(false);
    setDragOffset({ x: 0, y: 0 });
    clearDropHighlight();
    pointerIdRef.current = null;
  }

  function enterDragMode() {
    dragModeRef.current = true;
    setIsDragMode(true);
    if (cardRef.current && pointerIdRef.current !== null) {
      try {
        cardRef.current.setPointerCapture(pointerIdRef.current);
      } catch {
        // 一部環境でcaptureできなくてもドラッグ自体は継続する
      }
    }
  }

  // ドラッグ中はスクロールを止めたい。touchActionは動的に変更できないため、非passiveのtouchmoveで止める
  useEffect(() => {
    const el = cardRef.current;
    if (!el || !draggable) return;
    function onTouchMove(ev: TouchEvent) {
      if (dragModeRef.current) ev.preventDefault();
    }
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, [draggable]);

  useEffect(() => () => window.clearTimeout(pressTimer.current), []);

  const baseClass = className ? `card ${className}` : "card";
  const fullClass = isDragMode ? `${baseClass} dragging` : baseClass;

  return (
    <div className="swipe-wrap">
      <div className="swipe-bg">
        <TrashIcon size={18} />
        削除
      </div>
      <div
        ref={cardRef}
        className={fullClass}
        data-drop-folder={dragPayload?.kind === "folder" ? dragPayload.id : undefined}
        style={
          isDragMode
            ? {
                transform: `translate(${dragOffset.x}px, ${dragOffset.y}px) scale(1.02)`,
                touchAction: "pan-y",
                // 自分自身がelementFromPointに引っかかると下のドロップ先が判定できないため、ドラッグ中は自分をヒットテスト対象から外す
                // （pointerはsetPointerCaptureで捕捉済みのため、pointerEvents:noneでもmove/upは自分に届く）
                pointerEvents: "none",
              }
            : { transform: `translateX(${dx}px)`, touchAction: "pan-y" }
        }
        onPointerDown={(e) => {
          start.current = { x: e.clientX, y: e.clientY };
          dragging.current = false;
          dxRef.current = 0;
          pointerIdRef.current = e.pointerId;
          if (draggable) {
            window.clearTimeout(pressTimer.current);
            pressTimer.current = window.setTimeout(() => {
              if (!dragging.current && start.current) enterDragMode();
            }, PRESS_HOLD_MS);
          }
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          const dxNow = e.clientX - start.current.x;
          const dyNow = e.clientY - start.current.y;

          if (dragModeRef.current) {
            setDragOffset({ x: dxNow, y: dyNow });
            const el = document.elementFromPoint(e.clientX, e.clientY);
            const target = el?.closest("[data-drop-folder]") ?? null;
            if (target !== dropTargetRef.current) {
              clearDropHighlight();
              target?.classList.add("drop-active");
              dropTargetRef.current = target;
            }
            return;
          }

          // 400ms以内に12pxを超えて動いたら、長押しドラッグの予約を解除する（以後は既存のスワイプ/スクロール判定に従う）
          if (pressTimer.current !== undefined && (Math.abs(dxNow) > PRESS_MOVE_CANCEL_PX || Math.abs(dyNow) > PRESS_MOVE_CANCEL_PX)) {
            window.clearTimeout(pressTimer.current);
            pressTimer.current = undefined;
          }

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
          if (dragModeRef.current && dragPayload) {
            const resolved = resolveDropTarget(dropTargetRef.current);
            if (resolved !== "none") {
              const isSelf = dragPayload.kind === "folder" && resolved === dragPayload.id;
              const isSameLocation = resolved === (currentLocationId ?? null);
              if (!isSelf && !isSameLocation) {
                if (dragPayload.kind === "note") onMoveNote?.(dragPayload.id, resolved);
                else onMoveFolder?.(dragPayload.id, resolved);
              }
            }
          } else if (dragging.current && dxRef.current < -120) {
            onDelete();
          } else if (!dragging.current && start.current && !isLink) {
            onOpen();
          }
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
