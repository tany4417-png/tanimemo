import { useMemo, useState } from "react";
import { renderMarkdown, toggleCheckbox } from "../lib/markdown";
import type { Note } from "../lib/types";

type Props = {
  note: Note;
  onChange: (patch: { body?: string; tags?: string[]; importance?: 0 | 1 | 2 | 3 }) => void;
  onDelete: () => void;
  onBack: () => void;
};

export function NoteScreen({ note, onChange, onDelete, onBack }: Props) {
  const [editing, setEditing] = useState(note.body === "");
  const [draft, setDraft] = useState(note.body);
  const html = useMemo(() => renderMarkdown(note.body), [note.body]);

  function save() {
    onChange({ body: draft });
    setEditing(false);
  }

  function clickView(e: React.MouseEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement;
    if (t instanceof HTMLInputElement && t.type === "checkbox") {
      const boxes = [...e.currentTarget.querySelectorAll('input[type="checkbox"]')];
      onChange({ body: toggleCheckbox(note.body, boxes.indexOf(t)) });
    }
  }

  return (
    <div className="note">
      <div className="toolbar">
        <button onClick={onBack}>←</button>
        <span className="stars">
          {[1, 2, 3].map((i) => (
            <button
              key={i}
              className={note.importance >= i ? "star on" : "star"}
              onClick={() => onChange({ importance: (note.importance === i ? i - 1 : i) as 0 | 1 | 2 | 3 })}
            >
              ★
            </button>
          ))}
        </span>
        {editing ? (
          <button className="primary" onClick={save}>保存</button>
        ) : (
          <button onClick={() => { setDraft(note.body); setEditing(true); }}>編集</button>
        )}
        <button className="danger" onClick={() => { if (confirm("削除しますか？")) onDelete(); }}>削除</button>
      </div>
      <input
        key={note.id}
        className="tags-input"
        placeholder="タグ（カンマ区切り）"
        defaultValue={note.tags.join(", ")}
        onBlur={(e) => onChange({ tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
      />
      {editing ? (
        <textarea className="editor" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} />
      ) : (
        <div className="note-view" onClick={clickView} dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  );
}
