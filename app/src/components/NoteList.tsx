import { firstLineTitle } from "../lib/markdown";
import type { SortMode } from "../lib/sort";
import type { Note } from "../lib/types";

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
};

export function NoteList(p: Props) {
  return (
    <div className="list">
      <div className="toolbar">
        <input className="search" placeholder="検索" value={p.query} onChange={(e) => p.onQuery(e.target.value)} />
        <select value={p.sort} onChange={(e) => p.onSort(e.target.value as SortMode)}>
          <option value="created">新しい順</option>
          <option value="updated">更新順</option>
          <option value="importance">重要度順</option>
        </select>
        <button className="primary" onClick={p.onCreate}>新規</button>
      </div>
      <div className="tagbar">
        {p.allTags.map((t) => (
          <button key={t} className={p.activeTags.includes(t) ? "tag active" : "tag"} onClick={() => p.onToggleTag(t)}>
            {t}
          </button>
        ))}
      </div>
      {p.notes.map((n) => (
        <div key={n.id} className="card" onClick={() => p.onOpen(n.id)}>
          <div className="card-title">
            {n.importance > 0 && <span className="card-stars">{"★".repeat(n.importance)}</span>}
            {firstLineTitle(n.body)}
          </div>
          <div className="card-sub">
            {new Date(n.updatedAt).toLocaleString("ja-JP")} {n.tags.map((t) => `#${t}`).join(" ")}
          </div>
        </div>
      ))}
      {p.notes.length === 0 && <p className="empty">メモがありません</p>}
    </div>
  );
}
