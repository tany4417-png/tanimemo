import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { NoteList } from "./components/NoteList";
import { NoteScreen } from "./components/NoteScreen";
import { Settings } from "./components/Settings";
import { SyncStatus } from "./components/SyncStatus";
import { addImageFromBlob } from "./lib/attachments";
import { db } from "./lib/db";
import { exportZip } from "./lib/export";
import { allTags, createNote, listActiveNotes, softDeleteNote, updateNote, type NotePatch } from "./lib/notes";
import { filterByTags, searchNotes, sortNotes, type SortMode } from "./lib/sort";
import { runSync } from "./lib/sync";

type View = { name: "list" } | { name: "note"; id: string } | { name: "settings" };

export default function App() {
  const [view, setView] = useState<View>({ name: "list" });
  const [sort, setSortState] = useState<SortMode>(() => (localStorage.getItem("tanimemo.sort") as SortMode) ?? "created");
  const setSort = (m: SortMode) => {
    localStorage.setItem("tanimemo.sort", m);
    setSortState(m);
  };
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [query, setQuery] = useState("");
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
  const shown = useMemo(
    () => sortNotes(searchNotes(filterByTags(notes, activeTags), query), sort),
    [notes, activeTags, query, sort]
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
        const n = await createNote("(画像)", ["受信"]);
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
    const n = await createNote();
    setView({ name: "note", id: n.id });
  }, []);

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
        />
      )}
      {view.name === "note" && current && (
        <NoteScreen
          note={current}
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
            const blob = await exportZip();
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `タニメモ-エクスポート-${new Date().toISOString().slice(0, 10)}.zip`;
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        />
      )}
    </main>
  );
}
