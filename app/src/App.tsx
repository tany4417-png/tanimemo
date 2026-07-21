import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { NoteList } from "./components/NoteList";
import { NoteScreen } from "./components/NoteScreen";
import { Settings } from "./components/Settings";
import { SyncStatus } from "./components/SyncStatus";
import { TrashScreen } from "./components/TrashScreen";
import { addImageFromBlob } from "./lib/attachments";
import { db } from "./lib/db";
import { exportZip, localYmd } from "./lib/export";
import { createFolder, deleteFolderWithContents, folderPath, listChildFolders, moveFolder, moveNote, renameFolder, reorderFolder, reorderNote, repairOrphans } from "./lib/folders";
import { isBackFlick } from "./lib/gesture";
import { allTags, createNote, listActiveNotes, purgeExpiredTrashLocal, softDeleteNote, updateNote, type NotePatch } from "./lib/notes";
import type { ReorderPlan } from "./lib/reorder";
import { filterByTags, searchNotes, sortNotes, type SortMode } from "./lib/sort";
import { runSync } from "./lib/sync";

type View = { name: "list" } | { name: "note"; id: string; isNew?: boolean } | { name: "settings" } | { name: "trash" };

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
    async (id: string) => {
      await deleteFolderWithContents(id);
      scheduleSync();
    },
    [scheduleSync]
  );

  const onMoveNote = useCallback(
    async (noteId: string, folderId: string | null) => {
      await moveNote(noteId, folderId);
      scheduleSync();
    },
    [scheduleSync]
  );

  const onMoveFolder = useCallback(
    async (id: string, parentId: string | null) => {
      const moved = await moveFolder(id, parentId);
      if (moved) scheduleSync();
    },
    [scheduleSync]
  );

  const onReorderNote = useCallback(
    async (plan: ReorderPlan<{ id: string; orderKey: number | null }>) => {
      if (plan.normalized) {
        for (const item of plan.normalized) await reorderNote(item.id, item.orderKey as number);
      }
      await reorderNote(plan.targetId, plan.targetOrderKey);
      // 手動で並べ替えたら、現在のソートがmanualでなければ自動で切り替える（手動順が見える状態にする）
      if (sort !== "manual") setSort("manual");
      scheduleSync();
    },
    [sort, scheduleSync]
  );

  // フォルダの並べ替えはソートモードに関係なく常に有効
  const onReorderFolder = useCallback(
    async (plan: ReorderPlan<{ id: string; orderKey: number | null }>) => {
      if (plan.normalized) {
        for (const item of plan.normalized) await reorderFolder(item.id, item.orderKey as number);
      }
      await reorderFolder(plan.targetId, plan.targetOrderKey);
      scheduleSync();
    },
    [scheduleSync]
  );

  // 同期バー。一覧・メモ・設定・ゴミ箱それぞれのヘッダー（.list-header）内にまとめて表示するため、
  // 要素として一度だけ組み立てて各画面へ渡す（画面ごとに個別にposition:stickyを重ねると二重に固定されてしまうため）
  const syncBar = (
    <SyncStatus
      status={status}
      pending={pending}
      lastSync={lastSync}
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
            onDelete={async (id) => {
              await softDeleteNote(id);
              scheduleSync();
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
            onChange={async (patch) => {
              await updateNote(current.id, patch as NotePatch);
              scheduleSync();
            }}
            onDelete={async () => {
              await softDeleteNote(current.id);
              goForward({ name: "list" });
              scheduleSync();
            }}
            onBack={navigateBack}
            onMoved={() => scheduleSync()}
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
          <TrashScreen syncBar={syncBar} onBack={navigateBack} onRestored={() => scheduleSync()} />
        )}
      </div>
    </main>
  );
}
