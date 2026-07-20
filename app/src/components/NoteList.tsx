import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { resolveDropTarget } from "../lib/dnd";
import { listNotesIn } from "../lib/folders";
import { isTap, shouldCommitSwipe } from "../lib/gesture";
import { firstLineTitle, urlOnly } from "../lib/markdown";
import { planReorder, type ReorderPlan } from "../lib/reorder";
import type { SortMode } from "../lib/sort";
import type { Folder, Note } from "../lib/types";
import { BackIcon, FolderIcon, TrashIcon } from "./icons";
import { useAttachmentUrls } from "./useAttachmentUrls";

// ドラッグしたカードを他カードの前/後に挿入するときの共通コールバック型
type ReorderHandler = (draggedId: string, targetId: string, position: "before" | "after") => void;

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
  onReorderNote: (plan: ReorderPlan<{ id: string; orderKey: number | null }>) => void;
  onReorderFolder: (plan: ReorderPlan<{ id: string; orderKey: number | null }>) => void;
};

export function NoteList(p: Props) {
  const isBrowsingFolder = p.isBrowsingFolder;

  // ドラッグ中のカードを他カードの前/後へ挿入する（同種のみ）。前後キーの計算はplanReorder（純関数）に委ね、
  // ここでは対象リスト（現在の表示順）を渡してApp側の書き込みハンドラへ計画を渡すだけにする
  const handleReorderNote: ReorderHandler = (draggedId, targetId, position) => {
    const items = p.notes.map((n) => ({ id: n.id, orderKey: n.orderKey ?? null }));
    const plan = planReorder(items, draggedId, targetId, position);
    if (plan) p.onReorderNote(plan);
  };
  const handleReorderFolder: ReorderHandler = (draggedId, targetId, position) => {
    const items = p.childFolders.map((f) => ({ id: f.id, orderKey: f.orderKey ?? null }));
    const plan = planReorder(items, draggedId, targetId, position);
    if (plan) p.onReorderFolder(plan);
  };

  return (
    <div className="list">
      <div className="toolbar">
        {isBrowsingFolder && p.folderPath.length > 0 && (
          <button
            className="icon-btn"
            aria-label="親フォルダへ戻る"
            onClick={() => p.onOpenFolder(p.folderPath.length >= 2 ? p.folderPath[p.folderPath.length - 2].id : null)}
          >
            <BackIcon />
          </button>
        )}
        <input className="search" placeholder="検索" value={p.query} onChange={(e) => p.onQuery(e.target.value)} />
        <select value={p.sort} onChange={(e) => p.onSort(e.target.value as SortMode)}>
          <option value="created">新しい順</option>
          <option value="updated">更新順</option>
          <option value="importance">重要度順</option>
          <option value="manual">手動</option>
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
            onReorder={handleReorderFolder}
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
          onReorder={handleReorderNote}
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
  onReorder,
}: {
  folder: Folder;
  onOpen: () => void;
  onDelete: () => void;
  onMoveNote: (noteId: string, folderId: string | null) => void;
  onMoveFolder: (id: string, parentId: string | null) => void;
  onReorder: ReorderHandler;
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
      onReorder={onReorder}
    >
      <FolderIcon size={14} className="folder-icon" />
      <span className="folder-name">{folder.name}</span>
      <span className="folder-count">{count}件</span>
    </SwipeableCard>
  );
}

// 長押し（350ms静止）でドラッグモードに入るまでの猶予と、その間に許容する移動量
const PRESS_HOLD_MS = 350;
const PRESS_MOVE_CANCEL_PX = 16;

function SwipeableCard({
  onDelete,
  onOpen,
  className,
  children,
  dragPayload,
  currentLocationId,
  onMoveNote,
  onMoveFolder,
  onReorder,
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
  // フォルダ/パンくずへのドロップでない場合、ホバー中の同種カードの前/後へ挿入する（並べ替え）
  onReorder?: ReorderHandler;
}) {
  const [dx, setDx] = useState(0);
  // 判定はrefで行う（高速スワイプではstateの反映がpointerupに間に合わないため）
  const dxRef = useRef(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false); // 左スワイプ（削除）判定
  // pointerdownからの累計最大移動量（誤タップ防止: これが一定以上ならタップ扱いしない）
  const movedRef = useRef(0);
  // 直近のpointermove区間の水平速度（px/ms）。フリック確定判定に使う
  const vxRef = useRef(0);
  const lastMoveRef = useRef<{ x: number; t: number } | null>(null);

  const [isDragMode, setIsDragMode] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragModeRef = useRef(false); // 長押しドラッグ移動モード
  const pressTimer = useRef<number | undefined>(undefined);
  const pointerIdRef = useRef<number | null>(null);
  const dropTargetRef = useRef<Element | null>(null);
  // 並べ替え挿入インジケータのホバー先（フォルダ/パンくずへのドロップでない場合にのみ使う）
  const insertTargetRef = useRef<HTMLElement | null>(null);
  const insertBeforeRef = useRef(true);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const draggable = dragPayload !== undefined;

  function clearDropHighlight() {
    dropTargetRef.current?.classList.remove("drop-active");
    dropTargetRef.current = null;
  }

  function clearInsertHighlight() {
    insertTargetRef.current?.classList.remove("insert-before", "insert-after");
    insertTargetRef.current = null;
  }

  function reset() {
    dxRef.current = 0;
    setDx(0);
    start.current = null;
    dragging.current = false;
    movedRef.current = 0;
    vxRef.current = 0;
    lastMoveRef.current = null;
    window.clearTimeout(pressTimer.current);
    pressTimer.current = undefined;
    dragModeRef.current = false;
    setIsDragMode(false);
    setDragOffset({ x: 0, y: 0 });
    clearDropHighlight();
    clearInsertHighlight();
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

  // ドロップ先を解決し、有効なら移動を実行する（カード自身のonPointerUpと、下のdocumentフォールバックの両方から呼ぶ）。
  // フォルダ/パンくずへのドロップ（既存の移動）でない場合は、ホバー中の挿入インジケータに従って並べ替えを試みる
  function resolveDragMove() {
    if (!dragPayload) return;
    const resolved = resolveDropTarget(dropTargetRef.current);
    if (resolved !== "none") {
      const isSelf = dragPayload.kind === "folder" && resolved === dragPayload.id;
      const isSameLocation = resolved === (currentLocationId ?? null);
      if (isSelf || isSameLocation) return;
      if (dragPayload.kind === "note") onMoveNote?.(dragPayload.id, resolved);
      else onMoveFolder?.(dragPayload.id, resolved);
      return;
    }
    const insertTarget = insertTargetRef.current;
    const targetId = insertTarget?.getAttribute("data-reorder-id");
    if (targetId && targetId !== dragPayload.id) {
      onReorder?.(dragPayload.id, targetId, insertBeforeRef.current ? "before" : "after");
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

  // ドラッグモード中のフォールバック: setPointerCaptureが効かない環境では、指が離れた場所によっては
  // カード自身にpointerupが届かず固まることがある。documentにも張っておき、確実にドラッグを終了させる。
  // カード自身のonPointerUpが先に発火してreset()済み（dragModeRef.current=false）なら二重実行しない
  useEffect(() => {
    if (!isDragMode) return;
    function finish() {
      if (!dragModeRef.current) return;
      resolveDragMove();
      reset();
    }
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", finish);
    return () => {
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", finish);
    };
  }, [isDragMode, dragPayload, currentLocationId, onMoveNote, onMoveFolder, onReorder]);

  // アンマウント時にタイマーと、ドロップ先/挿入インジケータに残っているハイライトの後始末をする
  useEffect(
    () => () => {
      window.clearTimeout(pressTimer.current);
      clearDropHighlight();
      clearInsertHighlight();
    },
    []
  );

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
        // 並べ替え挿入インジケータ用（同種のカードだけを対象にするためkindも埋め込む）
        data-reorder-kind={dragPayload?.kind}
        data-reorder-id={dragPayload?.id}
        style={
          isDragMode
            ? {
                // 縮小して下のドロップ先(フォルダ/パンくず)が見えるようにする。translateとscaleは
                // 同一transformプロパティ内で合成する必要がある（別々に指定すると後勝ちで消えるため）
                transform: `translate(${dragOffset.x}px, ${dragOffset.y}px) scale(0.6)`,
                opacity: 0.85,
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
          movedRef.current = 0;
          vxRef.current = 0;
          lastMoveRef.current = { x: e.clientX, t: performance.now() };
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

          // 誤タップ防止: pointerdownからの累計最大移動量を追跡する
          const distNow = Math.sqrt(dxNow * dxNow + dyNow * dyNow);
          if (distNow > movedRef.current) movedRef.current = distNow;

          // フリック確定用: 直近のpointermove区間の水平速度（px/ms）を追跡する
          const nowT = performance.now();
          if (lastMoveRef.current) {
            const dt = nowT - lastMoveRef.current.t;
            if (dt > 0) vxRef.current = (e.clientX - lastMoveRef.current.x) / dt;
          }
          lastMoveRef.current = { x: e.clientX, t: nowT };

          if (dragModeRef.current) {
            setDragOffset({ x: dxNow, y: dyNow });
            const el = document.elementFromPoint(e.clientX, e.clientY);
            const dropEl = el?.closest("[data-drop-folder]") ?? null;

            // フォルダをフォルダカードへドラッグ中は、フォルダカードは常にdata-drop-folderを持つため
            // 何もしなければ常に「子として移動」判定が勝ってしまい並べ替えが起動できない。
            // カード上下端（外側25%ずつ）は並べ替え、中央帯は既存の「子として移動」に振り分ける
            let moveTarget: Element | null = dropEl;
            let edgeInsert: { el: HTMLElement; before: boolean } | null = null;
            if (
              dropEl &&
              dragPayload?.kind === "folder" &&
              dropEl.getAttribute("data-reorder-kind") === "folder" &&
              dropEl.getAttribute("data-reorder-id") !== dragPayload.id
            ) {
              const rect = dropEl.getBoundingClientRect();
              const relY = (e.clientY - rect.top) / rect.height;
              if (relY < 0.25 || relY > 0.75) {
                edgeInsert = { el: dropEl as HTMLElement, before: relY < 0.25 };
                moveTarget = null;
              }
            }

            if (moveTarget !== dropTargetRef.current) {
              clearDropHighlight();
              moveTarget?.classList.add("drop-active");
              dropTargetRef.current = moveTarget;
            }

            // 「子として移動」に振り分けなかった場合だけ、並べ替え挿入インジケータを判定する
            if (moveTarget === null && dragPayload) {
              const candidate =
                edgeInsert?.el ?? ((el?.closest(`[data-reorder-kind="${dragPayload.kind}"]`) ?? null) as HTMLElement | null);
              const validTarget =
                candidate && candidate.getAttribute("data-reorder-id") !== dragPayload.id ? candidate : null;
              if (validTarget) {
                const before = edgeInsert
                  ? edgeInsert.before
                  : (() => {
                      const rect = validTarget.getBoundingClientRect();
                      return e.clientY < rect.top + rect.height / 2;
                    })();
                if (validTarget !== insertTargetRef.current || before !== insertBeforeRef.current) {
                  clearInsertHighlight();
                  validTarget.classList.add(before ? "insert-before" : "insert-after");
                  insertTargetRef.current = validTarget;
                  insertBeforeRef.current = before;
                }
              } else {
                clearInsertHighlight();
              }
            } else {
              clearInsertHighlight();
            }
            return;
          }

          // 350ms以内に16pxを超えて動いたら、長押しドラッグの予約を解除する（以後は既存のスワイプ/スクロール判定に従う）
          if (pressTimer.current !== undefined && (Math.abs(dxNow) > PRESS_MOVE_CANCEL_PX || Math.abs(dyNow) > PRESS_MOVE_CANCEL_PX)) {
            window.clearTimeout(pressTimer.current);
            pressTimer.current = undefined;
          }

          // 開始は左20px以上かつ横成分が縦の1.2倍以上のときだけ（少し始まりやすく）
          if (!dragging.current && dxNow < -20 && Math.abs(dxNow) > 1.2 * Math.abs(dyNow)) {
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
          if (dragModeRef.current) {
            resolveDragMove();
          } else if (dragging.current && shouldCommitSwipe(dxRef.current, vxRef.current)) {
            onDelete();
          } else if (isTap(movedRef.current, dragging.current, dragModeRef.current) && start.current && !isLink) {
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
