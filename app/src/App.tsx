import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { NoteList } from "./components/NoteList";
import { NoteScreen } from "./components/NoteScreen";
import { Settings } from "./components/Settings";
import { SyncStatus } from "./components/SyncStatus";
import { TrashScreen } from "./components/TrashScreen";
import { popRedo, popUndo, pushAction, type ActionStacks } from "./lib/actions";
import { addImageFromBlob } from "./lib/attachments";
import { db } from "./lib/db";
import { exportZip, localYmd } from "./lib/export";
import {
  createFolder,
  deleteFolderWithContents,
  folderPath,
  listChildFolders,
  moveFolder,
  moveNote,
  renameFolder,
  reorderFolder,
  reorderNote,
  repairOrphans,
  restoreFolderWithContents,
  updateFolder,
} from "./lib/folders";
import { shouldCompleteBack } from "./lib/gesture";
import { allTags, createNote, listActiveNotes, purgeExpiredTrashLocal, restoreNote, softDeleteNote, updateNote, type NotePatch } from "./lib/notes";
import type { ReorderPlan } from "./lib/reorder";
import { filterByTags, searchNotes, sortNotes, type SortMode } from "./lib/sort";
import { runSync } from "./lib/sync";

type View = { name: "list" } | { name: "note"; id: string; isNew?: boolean } | { name: "settings" } | { name: "trash" };

// メモ内容の変更（App onChangeハンドラ経由）の操作ラベル。undo/redoボタンの表示にのみ使う
function labelForNotePatch(patch: NotePatch): string {
  if ("importance" in patch) return "重要度を変更";
  if ("tags" in patch) return "タグを変更";
  if ("body" in patch) return "本文を変更";
  return "メモを編集";
}

export default function App() {
  const [view, setView] = useState<View>({ name: "list" });
  // 画面遷移のスライド方向。戻り系（navigateBack・各画面の←ボタン・パンくずで上位へ）で"back"、
  // それ以外の遷移（新規作成・メモを開く・設定/ゴミ箱を開く・フォルダへ入るなど）で"forward"をセットする
  const [navDirection, setNavDirection] = useState<"forward" | "back">("forward");
  const [sort, setSortState] = useState<SortMode>(() => (localStorage.getItem("tanimemo.sort") as SortMode) ?? "created");
  const setSort = (m: SortMode) => {
    localStorage.setItem("tanimemo.sort", m);
    setSortState(m);
  };
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [token, setToken] = useState(() => localStorage.getItem("tanimemo.token") ?? "");
  const [status, setStatus] = useState<"idle" | "syncing" | "offline" | "error">("idle");
  const [lastSync, setLastSync] = useState<number | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const syncing = useRef(false);
  // main（.app）要素そのものへの参照。追従スワイプ中に現在マウント中の.screenをquerySelectorで
  // 見つけてtranslateXを直接書き込む（Reactのstateを介さないため、カード枚数が多い一覧でも重くならない）
  const mainRef = useRef<HTMLElement | null>(null);
  // 背景の右フリック（iOS風の戻るジェスチャー）検出用。pointerdown時の座標・時刻を覚えておき、
  // 追従スワイプの起点にする。カード等の操作要素上や、戻り先が無い場面でのpointerdownではnullのままにして無効化する
  const backSwipeStart = useRef<{ x: number; y: number; t: number } | null>(null);
  // 追従スワイプ中かどうか（dx>10・横優勢になった時点でtrueになる）。trueの間だけ.screenへtranslateXを反映し、
  // touchmove側で縦スクロールをpreventDefaultする
  const followingBack = useRef(false);
  // 追従スワイプ中に直接styleを書き換える対象（pointerdown時点でマウントされている.screen要素）
  const dragScreenEl = useRef<HTMLElement | null>(null);
  // グローバルundo/redo（削除・移動・並べ替え・内容変更の操作履歴）。メモリ内のみ＝リロードで消える
  const [stacks, setStacks] = useState<ActionStacks>({ past: [], future: [] });

  const notes = useLiveQuery(listActiveNotes, [], []);
  const pending = useLiveQuery(
    async () => (await db.notes.where("dirty").equals(1).count()) + (await db.attachments.where("dirty").equals(1).count()),
    [],
    0
  );
  const childFolders = useLiveQuery(() => listChildFolders(currentFolderId), [currentFolderId], []);
  const folderPathList = useLiveQuery(() => folderPath(currentFolderId), [currentFolderId], []);
  // 検索・タグ絞り込みがどちらも空のときだけ現在フォルダ直下に絞る。絞り込み中は全フォルダ横断（従来どおり）
  const isBrowsingFolder = query.trim() === "" && activeTags.length === 0;
  const scopedNotes = useMemo(
    () => (isBrowsingFolder ? notes.filter((n) => n.folderId === currentFolderId) : notes),
    [notes, isBrowsingFolder, currentFolderId]
  );
  const shown = useMemo(
    () => sortNotes(searchNotes(filterByTags(scopedNotes, activeTags), query), sort),
    [scopedNotes, activeTags, query, sort]
  );
  const current = view.name === "note" ? notes.find((n) => n.id === view.id) : undefined;

  const syncNow = useCallback(async () => {
    if (!token || syncing.current) return;
    syncing.current = true;
    setStatus("syncing");
    try {
      await runSync(token);
      await repairOrphans();
      setStatus("idle");
      setLastSync(Date.now());
    } catch {
      setStatus(navigator.onLine ? "error" : "offline");
    } finally {
      syncing.current = false;
    }
  }, [token]);

  const scheduleSync = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void syncNow(), 3000);
  }, [syncNow]);

  // 操作（削除・移動・並べ替え・内容変更）を1つ実行し、履歴へ積んで同期をスケジュールする共通ヘルパ。
  // 逆操作に必要な事前状態（スナップショット）はdoFn/undoFnを組み立てる呼び出し側で、操作前に控えておくこと
  const runAction = useCallback(
    async (label: string, doFn: () => Promise<void>, undoFn: () => Promise<void>) => {
      await doFn();
      setStacks((s) => pushAction(s, { label, undo: undoFn, redo: doFn }));
      scheduleSync();
    },
    [scheduleSync]
  );

  // 取り消し。対象の実体が同期・purgeで既に消えていた場合は例外を握りつぶして何もしない
  const onUndo = useCallback(async () => {
    const result = popUndo(stacks);
    if (!result) return;
    setStacks(result.stacks);
    try {
      await result.action.undo();
    } catch {
      // 実体が既に消えている等はここで握りつぶす（仕様）
    }
    scheduleSync();
  }, [stacks, scheduleSync]);

  // やり直し。取り消しと同様、対象の実体が既に消えていた場合は例外を握りつぶして何もしない
  const onRedo = useCallback(async () => {
    const result = popRedo(stacks);
    if (!result) return;
    setStacks(result.stacks);
    try {
      await result.action.redo();
    } catch {
      // 実体が既に消えている等はここで握りつぶす（仕様）
    }
    scheduleSync();
  }, [stacks, scheduleSync]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    void syncNow();
  }, [syncNow]);

  useEffect(() => {
    void (async () => {
      await purgeExpiredTrashLocal();
      await repairOrphans();
    })();
  }, []);

  useEffect(() => {
    const onOnline = () => void syncNow();
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncNow();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [syncNow]);

  useEffect(() => {
    async function onPaste(e: ClipboardEvent) {
      if (view.name !== "list") return;
      const target = e.target as HTMLElement | null;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      const items = [...(e.clipboardData?.items ?? [])];
      const files = items.filter((i) => i.kind === "file").map((i) => i.getAsFile()).filter((f): f is File => f !== null);
      const images = files.filter((f) => f.type.startsWith("image/"));
      if (images.length > 0) {
        const n = await createNote("", []);
        for (const f of images) await addImageFromBlob(n.id, f);
        scheduleSync();
        return;
      }
      const text = e.clipboardData?.getData("text")?.trim() ?? "";
      if (text) {
        await createNote(text, []);
        scheduleSync();
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [view, scheduleSync]);

  // "それ以外の遷移"（進み操作）用のsetViewラッパ。navDirectionを"forward"にしてから画面を切り替える
  const goForward = useCallback((v: View) => {
    setNavDirection("forward");
    setView(v);
  }, []);

  const onCreate = useCallback(async () => {
    const n = await createNote("", [], currentFolderId);
    goForward({ name: "note", id: n.id, isNew: true });
  }, [currentFolderId, goForward]);

  // フォルダカードで下の階層へ入る（進み操作＝forward）
  const onOpenFolder = useCallback((id: string | null) => {
    setNavDirection("forward");
    setCurrentFolderId(id);
  }, []);

  // パンくずで上位の階層へ戻る（戻り操作＝back）。折りたたみ済みの祖先idをそのまま受け取るだけなので計算不要
  const onNavigateUp = useCallback((id: string | null) => {
    setNavDirection("back");
    setCurrentFolderId(id);
  }, []);

  // 背景の右フリックで戻る先。メモ→一覧、設定→一覧、ゴミ箱→設定、一覧(フォルダ内)→親フォルダ、
  // 一覧(ルート)→何もしない。folderPathListはルート→現在フォルダの順の祖先列なので、
  // 末尾の1つ手前が親フォルダ（無ければ最上位でnull）
  const navigateBack = useCallback(() => {
    setNavDirection("back");
    if (view.name === "note") {
      setView({ name: "list" });
      return;
    }
    if (view.name === "settings") {
      setView({ name: "list" });
      return;
    }
    if (view.name === "trash") {
      setView({ name: "settings" });
      return;
    }
    if (view.name === "list" && currentFolderId !== null) {
      const parent = folderPathList.length >= 2 ? folderPathList[folderPathList.length - 2].id : null;
      setCurrentFolderId(parent);
    }
  }, [view, currentFolderId, folderPathList]);

  // 戻り先が無い場面（一覧ルート）かどうか。navigateBackの分岐と対応させておき、falseなら追従自体を始めない
  const canGoBack = view.name !== "list" || currentFolderId !== null;

  // 追従中の.screenをtranslateX(0)へ150ms transitionで戻す（未達での指離し・縦スクロールへの移行で共通に使う）
  function snapBackScreen() {
    const el = dragScreenEl.current;
    if (!el) return;
    el.style.transition = "transform 150ms ease";
    el.style.transform = "translateX(0px)";
  }

  // 背景の右フリック検出（iOS風の戻るジェスチャー）。カード・ボタン等の操作要素上のpointerdownは
  // closestで除外し、既存のスワイプ・D&D・タップ操作と干渉しないようにする。戻り先が無い場面でも始めない
  const onMainPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const target = e.target as HTMLElement;
      if (!canGoBack || target.closest(".card, .swipe-wrap, button, a, input, textarea, select, .breadcrumb, .tagbar, .overlay")) {
        backSwipeStart.current = null;
        return;
      }
      backSwipeStart.current = { x: e.clientX, y: e.clientY, t: Date.now() };
      followingBack.current = false;
      dragScreenEl.current = null;
    },
    [canGoBack]
  );

  // 右方向のドラッグ（dx>10・|dx|>|dy|）が始まったら、現在の.screenを指に追従させる（transform: translateX(dx)、dx≥0のみ）。
  // 縦優勢（|dy|>|dx|）になったら追従を中止して0に戻し、このジェスチャーは終える（縦スクロールに譲る）
  const onMainPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const start = backSwipeStart.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;

    if (!followingBack.current) {
      if (!(dx > 10 && Math.abs(dx) > Math.abs(dy))) return;
      followingBack.current = true;
      dragScreenEl.current = mainRef.current?.querySelector<HTMLElement>(".screen") ?? null;
      const el = dragScreenEl.current;
      if (el) el.style.transition = "none";
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // 一部環境でcaptureできなくても追従自体は継続する
      }
    }

    if (Math.abs(dy) > Math.abs(dx)) {
      snapBackScreen();
      backSwipeStart.current = null;
      followingBack.current = false;
      dragScreenEl.current = null;
      return;
    }

    const el = dragScreenEl.current;
    if (el) el.style.transform = `translateX(${Math.max(0, dx)}px)`;
  }, []);

  const onMainPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const start = backSwipeStart.current;
      const wasFollowing = followingBack.current;
      backSwipeStart.current = null;
      followingBack.current = false;
      if (!start || !wasFollowing) {
        dragScreenEl.current = null;
        return;
      }
      const dx = e.clientX - start.x;
      const vx = dx / Math.max(1, Date.now() - start.t);
      if (shouldCompleteBack(dx, vx)) navigateBack();
      else snapBackScreen();
      dragScreenEl.current = null;
    },
    [navigateBack]
  );

  // pointercancel（中断）でも追従中なら0へ戻し、状態を片付ける
  const onMainPointerCancel = useCallback(() => {
    if (followingBack.current) snapBackScreen();
    backSwipeStart.current = null;
    followingBack.current = false;
    dragScreenEl.current = null;
  }, []);

  // 追従中（followingBack）は縦スクロールを起こさない。既存のD&D（NoteList側）と同じく、
  // 非passiveのtouchmoveでpreventDefaultする以外に手段が無いため、ここだけネイティブイベントを使う
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    function onTouchMove(ev: TouchEvent) {
      if (followingBack.current) ev.preventDefault();
    }
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, []);

  const onCreateFolder = useCallback(async () => {
    const name = prompt("新しいフォルダ名");
    if (!name || !name.trim()) return;
    await createFolder(name.trim(), currentFolderId);
    scheduleSync();
  }, [currentFolderId, scheduleSync]);

  const onRenameCurrentFolder = useCallback(async () => {
    const cur = folderPathList[folderPathList.length - 1];
    if (!cur) return;
    const name = prompt("フォルダ名", cur.name);
    if (!name || !name.trim()) return;
    await renameFolder(cur.id, name.trim());
    scheduleSync();
  }, [folderPathList, scheduleSync]);

  const onDeleteFolder = useCallback(
    (id: string) => {
      void runAction(
        "フォルダを削除",
        async () => {
          await deleteFolderWithContents(id);
        },
        async () => {
          await restoreFolderWithContents(id);
        }
      );
    },
    [runAction]
  );

  const onRestoreNoteFromTrash = useCallback(
    (id: string) => {
      void runAction(
        "メモを復元",
        async () => {
          await restoreNote(id);
        },
        async () => {
          await softDeleteNote(id);
        }
      );
    },
    [runAction]
  );

  const onRestoreFolderFromTrash = useCallback(
    (id: string) => {
      void runAction(
        "フォルダを復元",
        async () => {
          await restoreFolderWithContents(id);
        },
        async () => {
          await deleteFolderWithContents(id);
        }
      );
    },
    [runAction]
  );

  // メモ移動（D&D・移動ピッカー共通）。移動前のfolderIdを控えておき、undoで戻す
  const onMoveNote = useCallback(
    (noteId: string, folderId: string | null) => {
      const before = notes.find((n) => n.id === noteId)?.folderId ?? null;
      void runAction(
        "メモを移動",
        async () => {
          await moveNote(noteId, folderId);
        },
        async () => {
          await moveNote(noteId, before);
        }
      );
    },
    [notes, runAction]
  );

  // フォルダ移動（D&D）。moveFolderがfalse（自分自身への移動・子孫への移動など無効な操作）を返した場合は
  // 何も起きていないので履歴に積まない・同期もしない（falseになるケースは握りつぶしてよい仕様）
  const onMoveFolder = useCallback(
    (id: string, parentId: string | null) => {
      void (async () => {
        const cur = await db.folders.get(id);
        const before = cur?.parentId ?? null;
        const moved = await moveFolder(id, parentId);
        if (!moved) return;
        setStacks((s) =>
          pushAction(s, {
            label: "フォルダを移動",
            undo: async () => {
              await moveFolder(id, before);
            },
            redo: async () => {
              await moveFolder(id, parentId);
            },
          })
        );
        scheduleSync();
      })();
    },
    [scheduleSync]
  );

  const onReorderNote = useCallback(
    (plan: ReorderPlan<{ id: string; orderKey: number | null }>) => {
      // 適用前のorderKeyを控える（normalized適用がある場合は対象全件、無ければドラッグ対象のみ）
      const beforeOf = (id: string) => notes.find((n) => n.id === id)?.orderKey ?? null;
      const beforeNormalized = plan.normalized?.map((item) => ({ id: item.id, orderKey: beforeOf(item.id) }));
      const beforeTarget = beforeOf(plan.targetId);
      void runAction(
        "メモの並べ替え",
        async () => {
          if (plan.normalized) {
            for (const item of plan.normalized) await reorderNote(item.id, item.orderKey as number);
          }
          await reorderNote(plan.targetId, plan.targetOrderKey);
          // 手動で並べ替えたら、現在のソートがmanualでなければ自動で切り替える（手動順が見える状態にする）
          if (sort !== "manual") setSort("manual");
        },
        async () => {
          // 元のorderKeyへ一括書き戻す（nullだった場合もあるため、number限定のreorderNoteでなくupdateNoteを使う）
          if (beforeNormalized) {
            for (const item of beforeNormalized) await updateNote(item.id, { orderKey: item.orderKey });
          }
          await updateNote(plan.targetId, { orderKey: beforeTarget });
        }
      );
    },
    [notes, sort, runAction]
  );

  // フォルダの並べ替えはソートモードに関係なく常に有効
  const onReorderFolder = useCallback(
    (plan: ReorderPlan<{ id: string; orderKey: number | null }>) => {
      const beforeOf = (id: string) => childFolders.find((f) => f.id === id)?.orderKey ?? null;
      const beforeNormalized = plan.normalized?.map((item) => ({ id: item.id, orderKey: beforeOf(item.id) }));
      const beforeTarget = beforeOf(plan.targetId);
      void runAction(
        "フォルダの並べ替え",
        async () => {
          if (plan.normalized) {
            for (const item of plan.normalized) await reorderFolder(item.id, item.orderKey as number);
          }
          await reorderFolder(plan.targetId, plan.targetOrderKey);
        },
        async () => {
          if (beforeNormalized) {
            for (const item of beforeNormalized) await updateFolder(item.id, { orderKey: item.orderKey });
          }
          await updateFolder(plan.targetId, { orderKey: beforeTarget });
        }
      );
    },
    [childFolders, runAction]
  );

  // 同期バー。一覧・メモ・設定・ゴミ箱それぞれのヘッダー（.list-header）内にまとめて表示するため、
  // 要素として一度だけ組み立てて各画面へ渡す（画面ごとに個別にposition:stickyを重ねると二重に固定されてしまうため）
  const syncBar = (
    <SyncStatus
      status={status}
      pending={pending}
      lastSync={lastSync}
      canUndo={stacks.past.length > 0}
      canRedo={stacks.future.length > 0}
      onUndo={() => void onUndo()}
      onRedo={() => void onRedo()}
      onSync={() => void syncNow()}
      onSettings={() => goForward({ name: "settings" })}
    />
  );

  // navDirectionに応じたスライドイン方向のクラス（戻り=左から、進み=右から）
  const slideClass = navDirection === "back" ? "slide-in-left" : "slide-in-right";

  return (
    <main
      className="app"
      ref={mainRef}
      onPointerDown={onMainPointerDown}
      onPointerMove={onMainPointerMove}
      onPointerUp={onMainPointerUp}
      onPointerCancel={onMainPointerCancel}
    >
      {/* 画面切替（list/note/settings/trash）は各画面自身のルート要素(.screen)にslideClassを直接付ける。
          view.nameで排他的に切り替わるため、これだけで乗り換え時に毎回フルマウントされスライドアニメが動く */}
      {view.name === "list" && (
        <NoteList
          syncBar={syncBar}
          slideClass={slideClass}
          notes={shown}
          allTags={allTags(notes)}
          sort={sort}
          onSort={setSort}
          activeTags={activeTags}
          onToggleTag={(t) => setActiveTags((a) => (a.includes(t) ? a.filter((x) => x !== t) : [...a, t]))}
          query={query}
          onQuery={setQuery}
          onOpen={(id) => goForward({ name: "note", id })}
          onCreate={onCreate}
          onDelete={(id) => {
            void runAction(
              "メモを削除",
              async () => {
                await softDeleteNote(id);
              },
              async () => {
                await restoreNote(id);
              }
            );
          }}
          isBrowsingFolder={isBrowsingFolder}
          currentFolderId={currentFolderId}
          navDirection={navDirection}
          folderPath={folderPathList}
          childFolders={childFolders}
          onOpenFolder={onOpenFolder}
          onNavigateUp={onNavigateUp}
          onBack={navigateBack}
          onCreateFolder={onCreateFolder}
          onRenameCurrentFolder={onRenameCurrentFolder}
          onDeleteFolder={onDeleteFolder}
          onMoveNote={onMoveNote}
          onMoveFolder={onMoveFolder}
          onReorderNote={onReorderNote}
          onReorderFolder={onReorderFolder}
        />
      )}
      {view.name === "note" && current && (
        <NoteScreen
          syncBar={syncBar}
          slideClass={slideClass}
          note={current}
          startEditing={view.name === "note" && view.isNew === true}
          onChange={(patch) => {
            // 逆操作に必要な旧値は、変更対象のフィールドだけをcurrentからスナップショットする
            const before: NotePatch = {};
            if ("body" in patch) before.body = current.body;
            if ("tags" in patch) before.tags = current.tags;
            if ("importance" in patch) before.importance = current.importance;
            void runAction(
              labelForNotePatch(patch),
              async () => {
                await updateNote(current.id, patch as NotePatch);
              },
              async () => {
                await updateNote(current.id, before);
              }
            );
          }}
          onDelete={() => {
            void runAction(
              "メモを削除",
              async () => {
                await softDeleteNote(current.id);
              },
              async () => {
                await restoreNote(current.id);
              }
            ).then(() => goForward({ name: "list" }));
          }}
          onBack={navigateBack}
          onMoveNote={onMoveNote}
          onAttached={() => scheduleSync()}
        />
      )}
      {view.name === "settings" && (
        <Settings
          syncBar={syncBar}
          slideClass={slideClass}
          token={token}
          onSave={(t) => {
            localStorage.setItem("tanimemo.token", t);
            setToken(t);
            goForward({ name: "list" });
          }}
          onBack={navigateBack}
          onExport={async () => {
            const { blob, missingImages } = await exportZip(token);
            if (missingImages > 0) {
              alert(`未取得の画像 ${missingImages}件はこの端末に無いため含まれていません`);
            }
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `タニメモ-エクスポート-${localYmd(new Date())}.zip`;
            a.click();
            URL.revokeObjectURL(a.href);
          }}
          onTrash={() => goForward({ name: "trash" })}
        />
      )}
      {view.name === "trash" && (
        <TrashScreen
          syncBar={syncBar}
          slideClass={slideClass}
          onBack={navigateBack}
          onRestoreNote={onRestoreNoteFromTrash}
          onRestoreFolder={onRestoreFolderFromTrash}
        />
      )}
    </main>
  );
}
