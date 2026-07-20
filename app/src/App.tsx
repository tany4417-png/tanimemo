import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { NoteList } from "./components/NoteList";
import { NoteScreen } from "./components/NoteScreen";
import { Settings } from "./components/Settings";
import { SyncStatus } from "./components/SyncStatus";
import { TrashScreen } from "./components/TrashScreen";
import { addImageFromBlob } from "./lib/attachments";
import { db } from "./lib/db";
import { exportZip, localYmd } from "./lib/export";
import { createFolder, deleteFolderKeepingContents, folderPath, listChildFolders, moveFolder, moveNote, renameFolder } from "./lib/folders";
import { allTags, createNote, listActiveNotes, purgeExpiredTrashLocal, softDeleteNote, updateNote, type NotePatch } from "./lib/notes";
import { filterByTags, searchNotes, sortNotes, type SortMode } from "./lib/sort";
import { runSync } from "./lib/sync";

type View = { name: "list" } | { name: "note"; id: string; isNew?: boolean } | { name: "settings" } | { name: "trash" };

export default function App() {
  const [view, setView] = useState<View>({ name: "list" });
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
    void purgeExpiredTrashLocal();
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
        const n = await createNote("", ["受信"]);
        for (const f of images) await addImageFromBlob(n.id, f);
        scheduleSync();
        return;
      }
      const text = e.clipboardData?.getData("text")?.trim() ?? "";
      if (text) {
        await createNote(text, ["受信"]);
        scheduleSync();
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [view, scheduleSync]);

  const onCreate = useCallback(async () => {
    const n = await createNote("", [], currentFolderId);
    setView({ name: "note", id: n.id, isNew: true });
  }, [currentFolderId]);

  const onOpenFolder = useCallback((id: string | null) => setCurrentFolderId(id), []);

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
      await deleteFolderKeepingContents(id);
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

  return (
    <main className="app">
      <SyncStatus status={status} pending={pending} lastSync={lastSync} onSync={() => void syncNow()} onSettings={() => setView({ name: "settings" })} />
      {view.name === "list" && (
        <NoteList
          notes={shown}
          allTags={allTags(notes)}
          sort={sort}
          onSort={setSort}
          activeTags={activeTags}
          onToggleTag={(t) => setActiveTags((a) => (a.includes(t) ? a.filter((x) => x !== t) : [...a, t]))}
          query={query}
          onQuery={setQuery}
          onOpen={(id) => setView({ name: "note", id })}
          onCreate={onCreate}
          onDelete={async (id) => {
            await softDeleteNote(id);
            scheduleSync();
          }}
          folderPath={folderPathList}
          childFolders={childFolders}
          onOpenFolder={onOpenFolder}
          onCreateFolder={onCreateFolder}
          onRenameCurrentFolder={onRenameCurrentFolder}
          onDeleteFolder={onDeleteFolder}
          onMoveNote={onMoveNote}
          onMoveFolder={onMoveFolder}
        />
      )}
      {view.name === "note" && current && (
        <NoteScreen
          note={current}
          startEditing={view.name === "note" && view.isNew === true}
          onChange={async (patch) => {
            await updateNote(current.id, patch as NotePatch);
            scheduleSync();
          }}
          onDelete={async () => {
            await softDeleteNote(current.id);
            setView({ name: "list" });
            scheduleSync();
          }}
          onBack={() => setView({ name: "list" })}
          onMoved={() => scheduleSync()}
        />
      )}
      {view.name === "settings" && (
        <Settings
          token={token}
          onSave={(t) => {
            localStorage.setItem("tanimemo.token", t);
            setToken(t);
            setView({ name: "list" });
          }}
          onBack={() => setView({ name: "list" })}
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
          onTrash={() => setView({ name: "trash" })}
        />
      )}
      {view.name === "trash" && (
        <TrashScreen onBack={() => setView({ name: "settings" })} onRestored={() => scheduleSync()} />
      )}
    </main>
  );
}
