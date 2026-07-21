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
import { isBackFlick } from "./lib/gesture";
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
  // 背景の右フリック（iOS風の戻るジェスチャー）検出用。pointerdown時の座標・時刻を覚えておき、
  // pointerupでisBackFlickへ渡す。カード等の操作要素上のpointerdownではnullのままにして無効化する
  const backSwipeStart = useRef<{ x: number; y: number; t: number } | null>(null);
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

  // 背景の右フリック検出（iOS風の戻るジェスチャー）。カード・ボタン等の操作要素上のpointerdownは
  // closestで除外し、既存のスワイプ・D&D・タップ操作と干渉しないようにする
  const onMainPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest(".card, .swipe-wrap, button, a, input, textarea, select, .breadcrumb, .tagbar, .overlay")) {
      backSwipeStart.current = null;
      return;
    }
    backSwipeStart.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  }, []);

  const onMainPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const start = backSwipeStart.current;
      backSwipeStart.current = null;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const elapsedMs = Date.now() - start.t;
      if (isBackFlick(dx, dy, elapsedMs)) navigateBack();
    },
    [navigateBack]
  );

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
    <main className="app" onPointerDown={onMainPointerDown} onPointerUp={onMainPointerUp}>
      {/* 画面切替（list/note/settings/trash）ごとにkeyを変えて全面スライドで再マウントさせる。DOM構造変更はこのラッパのみ */}
      <div className={`view-transition ${slideClass}`} key={view.name}>
        {view.name === "list" && (
          <NoteList
            syncBar={syncBar}
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
            onBack={navigateBack}
            onRestoreNote={onRestoreNoteFromTrash}
            onRestoreFolder={onRestoreFolderFromTrash}
          />
        )}
      </div>
    </main>
  );
}
