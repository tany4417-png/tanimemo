import { useEffect, useRef, useState } from "react";
import { resolveDropTarget } from "../lib/dnd";
import { isTap, shouldEnterMouseDrag, shouldOpenSwipe } from "../lib/gesture";
import { TrashIcon } from "./icons";

// ドラッグしたカードを他カードの前/後に挿入するときの共通コールバック型
export type ReorderHandler = (draggedId: string, targetId: string, position: "before" | "after") => void;

// カードの長押しドラッグが運ぶ荷物。noteはメモ本体、folderはフォルダそのものを表す
type DragPayload = { kind: "note"; id: string } | { kind: "folder"; id: string };

// 長押し（350ms静止）でドラッグモードに入るまでの猶予と、その間に許容する移動量
const PRESS_HOLD_MS = 350;
const PRESS_MOVE_CANCEL_PX = 16;

// スワイプで削除ボタンが開いた状態のときのtranslateX（削除ボタンの幅と一致）
const SWIPE_OPEN_PX = -96;

export function SwipeableCard({
  isOpen,
  onOpenChange,
  onCloseOthers,
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
  // このカードの削除ボタンが開いているか（NoteListが「開いているカードid」を1つだけ保持し、controlled化する。
  // 自分がどのidかはNoteList側の各コールバックに束縛済みなので、このコンポーネント自身はidを持つ必要が無い）
  isOpen: boolean;
  // 開く/閉じるをNoteListへ伝える（trueで自分を開く=他は自動的に閉じる、falseで自分を閉じる）
  onOpenChange: (open: boolean) => void;
  // 自分以外が開いていれば閉じるよう伝える（他のカードの操作開始時に呼ぶ）
  onCloseOthers: () => void;
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
  // dxは「現在のカードの水平位置」そのもの（閉:0 / 開:SWIPE_OPEN_PX）。ドラッグ中はこの範囲内でリアルタイムに追従する
  const [dx, setDx] = useState(() => (isOpen ? SWIPE_OPEN_PX : 0));
  // 判定はrefで行う（高速スワイプではstateの反映がpointerupに間に合わないため）
  const dxRef = useRef(dx);
  // pointerdown時点でのカード位置（閉:0 / 開:SWIPE_OPEN_PX）。相対移動量dxNowの基準にする
  const baseDxRef = useRef(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false); // 左右スワイプ（開閉）判定
  // pointerdownからの累計最大移動量（誤タップ防止: これが一定以上ならタップ扱いしない）
  const movedRef = useRef(0);

  const [isDragMode, setIsDragMode] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragModeRef = useRef(false); // 長押しドラッグ移動モード
  const pressTimer = useRef<number | undefined>(undefined);
  const pointerIdRef = useRef<number | null>(null);
  // pointerdown時点のe.pointerType（"mouse" | "touch" | "pen"）。マウスは長押し不要・即ドラッグにするための分岐に使う
  const pointerTypeRef = useRef<string>("touch");
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

  // ジェスチャー種別（スワイプ/ドラッグ/タップ）判定用の状態だけを片付ける。dx（開閉の見た目位置）はここでは触らない
  function reset() {
    start.current = null;
    dragging.current = false;
    movedRef.current = 0;
    window.clearTimeout(pressTimer.current);
    pressTimer.current = undefined;
    dragModeRef.current = false;
    setIsDragMode(false);
    setDragOffset({ x: 0, y: 0 });
    clearDropHighlight();
    clearInsertHighlight();
    pointerIdRef.current = null;
  }

  // 開閉のどちらかへスナップする（150ms transitionはstyle側でdragging.current===falseのときに適用される）
  function snapTo(open: boolean) {
    dxRef.current = open ? SWIPE_OPEN_PX : 0;
    setDx(dxRef.current);
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

  // 他のカードが開いたことで自分のisOpenがfalseになった場合など、外部からの開閉状態の変化に追従する。
  // 自分自身が今まさにジェスチャー中（スワイプ/ドラッグ）なら、その操作の決着を優先し何もしない
  useEffect(() => {
    if (dragging.current || dragModeRef.current) return;
    const target = isOpen ? SWIPE_OPEN_PX : 0;
    if (dxRef.current !== target) snapTo(isOpen);
  }, [isOpen]);

  const baseClass = className ? `card ${className}` : "card";
  const fullClass = isDragMode ? `${baseClass} dragging` : baseClass;

  return (
    <div className="swipe-wrap">
      <button type="button" className="swipe-bg" aria-label="削除" onClick={onDelete}>
        <TrashIcon size={18} />
        削除
      </button>
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
            : {
                transform: `translateX(${dx}px)`,
                // 指で動かしている最中は1:1で追従させ、指を離した後のスナップだけアニメーションさせる
                transition: dragging.current ? "none" : "transform 150ms ease",
                touchAction: "pan-y",
              }
        }
        onPointerDown={(e) => {
          // 自分以外に開いている（削除ボタンが見えている）カードがあれば、この操作の開始と同時に閉じる
          onCloseOthers();
          start.current = { x: e.clientX, y: e.clientY };
          dragging.current = false;
          // 今のカード位置（閉:0 / 開:SWIPE_OPEN_PX）を基準にする。開いた状態からの右スワイプで閉じる操作を成立させるため
          baseDxRef.current = isOpen ? SWIPE_OPEN_PX : 0;
          dxRef.current = baseDxRef.current;
          movedRef.current = 0;
          pointerIdRef.current = e.pointerId;
          pointerTypeRef.current = e.pointerType;
          // マウスは長押し不要（onPointerMoveで8px以上動いた時点で即ドラッグモードに入る）。
          // タッチ/ペンは従来どおり350ms静止でドラッグモードの予約を入れる
          if (draggable && e.pointerType !== "mouse") {
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

          // マウス: 長押し不要。押したまま8px以上動いたら方向を問わず即ドラッグモードに入る
          if (draggable && !dragModeRef.current && pointerTypeRef.current === "mouse" && shouldEnterMouseDrag(distNow)) {
            enterDragMode();
          }

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

          // マウスはスワイプ削除を使わない（誤発動防止）。PCでの削除はカードを開いて削除ボタンを押す運用に留める
          if (pointerTypeRef.current === "mouse") return;

          // 350ms以内に16pxを超えて動いたら、長押しドラッグの予約を解除する（以後は既存のスワイプ/スクロール判定に従う）
          if (pressTimer.current !== undefined && (Math.abs(dxNow) > PRESS_MOVE_CANCEL_PX || Math.abs(dyNow) > PRESS_MOVE_CANCEL_PX)) {
            window.clearTimeout(pressTimer.current);
            pressTimer.current = undefined;
          }

          const horizontalDominant = Math.abs(dxNow) > 1.2 * Math.abs(dyNow);
          // 開始は左20px以上かつ横成分が縦の1.2倍以上のときだけ（少し始まりやすく）＝削除ボタンを開く方向
          const opening = dxNow < -20 && horizontalDominant;
          // 開いている状態からの右20px以上の動きも同じ基準でスワイプ開始とみなす＝閉じる方向
          const closing = baseDxRef.current === SWIPE_OPEN_PX && dxNow > 20 && horizontalDominant;
          if (!dragging.current && (opening || closing)) {
            dragging.current = true;
            try {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            } catch {
              // 一部環境でcaptureできなくてもスワイプ自体は成立する
            }
          }
          if (dragging.current) {
            // SWIPE_OPEN_PX〜0の範囲にクランプする（削除ボタンの幅を超えて露出させない）
            dxRef.current = Math.max(SWIPE_OPEN_PX, Math.min(0, baseDxRef.current + dxNow));
            setDx(dxRef.current);
          }
        }}
        onPointerUp={(e) => {
          const isLink = (e.target as HTMLElement).closest("a") !== null;
          if (dragModeRef.current) {
            resolveDragMove();
          } else if (dragging.current) {
            // 指を離した時点でdxRefが-40pxを超えて左にあれば開いた状態にスナップ、それ以外は閉じる
            const open = shouldOpenSwipe(dxRef.current);
            snapTo(open);
            onOpenChange(open);
          } else if (isTap(movedRef.current, dragging.current, dragModeRef.current) && start.current && !isLink) {
            // 開いた状態のカード本体をタップしたときは、ノートを開かず閉じることを優先する
            if (isOpen) {
              snapTo(false);
              onOpenChange(false);
            } else {
              onOpen();
            }
          }
          reset();
        }}
        onPointerCancel={() => {
          // 中断されたスワイプは、controlled状態（isOpen）に対応する位置へ戻す
          if (dragging.current) snapTo(isOpen);
          reset();
        }}
      >
        {children}
      </div>
    </div>
  );
}
