import { useCallback, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { NoteList } from "./components/NoteList";
import { NoteScreen } from "./components/NoteScreen";
import { allTags, createNote, listActiveNotes, softDeleteNote, updateNote, type NotePatch } from "./lib/notes";
import { filterByTags, searchNotes, sortNotes, type SortMode } from "./lib/sort";

type View = { name: "list" } | { name: "note"; id: string };

export default function App() {
  const [view, setView] = useState<View>({ name: "list" });
  const [sort, setSortState] = useState<SortMode>(() => (localStorage.getItem("tanimemo.sort") as SortMode) ?? "created");
  const setSort = (m: SortMode) => {
    localStorage.setItem("tanimemo.sort", m);
    setSortState(m);
  };
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const notes = useLiveQuery(listActiveNotes, [], []);
  const shown = useMemo(
    () => sortNotes(searchNotes(filterByTags(notes, activeTags), query), sort),
    [notes, activeTags, query, sort]
  );
  const current = view.name === "note" ? notes.find((n) => n.id === view.id) : undefined;

  const onCreate = useCallback(async () => {
    const n = await createNote();
    setView({ name: "note", id: n.id });
  }, []);

  return (
    <main className="app">
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
          onChange={(patch) => void updateNote(current.id, patch as NotePatch)}
          onDelete={async () => {
            await softDeleteNote(current.id);
            setView({ name: "list" });
          }}
          onBack={() => setView({ name: "list" })}
        />
      )}
    </main>
  );
}
