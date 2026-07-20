import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { flattenFolderTree, listAllFolders, moveNote } from "../lib/folders";
import { renderMarkdown, toggleCheckbox } from "../lib/markdown";
import type { Note } from "../lib/types";
import { useAttachmentUrls } from "./useAttachmentUrls";

type Props = {
  note: Note;
  startEditing?: boolean;
  onChange: (patch: { body?: string; tags?: string[]; importance?: 0 | 1 | 2 | 3 }) => void;
  onDelete: () => void;
  onBack: () => void;
  onMoved: () => void;
};

export function NoteScreen({ note, startEditing, onChange, onDelete, onBack, onMoved }: Props) {
  const [editing, setEditing] = useState(startEditing ?? false);
  const [draft, setDraft] = useState(note.body);
  const [movePickerOpen, setMovePickerOpen] = useState(false);
  const html = useMemo(() => renderMarkdown(note.body), [note.body]);
  const allFolders = useLiveQuery(listAllFolders, [], []);
  const flatFolders = useMemo(() => flattenFolderTree(allFolders), [allFolders]);

  function save() {
    onChange({ body: draft });
    setEditing(false);
  }

  async function moveTo(folderId: string | null) {
    if (folderId === note.folderId) return;
    await moveNote(note.id, folderId);
    setMovePickerOpen(false);
    onMoved();
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
        <button onClick={() => setMovePickerOpen((v) => !v)}>移動…</button>
        {editing ? (
          <button className="primary" onClick={save}>保存</button>
        ) : (
          <button onClick={() => { setDraft(note.body); setEditing(true); }}>編集</button>
        )}
        <button className="danger" onClick={onDelete}>削除</button>
      </div>
      {movePickerOpen && (
        <div className="folder-picker">
          <div
            className={note.folderId === null ? "folder-picker-item disabled" : "folder-picker-item"}
            onClick={() => void moveTo(null)}
          >
            すべてのメモ
          </div>
          {flatFolders.map(({ folder, depth }) => (
            <div
              key={folder.id}
              className={note.folderId === folder.id ? "folder-picker-item disabled" : "folder-picker-item"}
              style={{ paddingLeft: `${12 + depth * 16}px` }}
              onClick={() => void moveTo(folder.id)}
            >
              {folder.name}
            </div>
          ))}
        </div>
      )}
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
      <Gallery noteId={note.id} />
    </div>
  );
}

export function Gallery({ noteId }: { noteId: string }) {
  const { metas, urls } = useAttachmentUrls(noteId);
  const [fullId, setFullId] = useState<string | null>(null);

  return (
    <>
      <div className="gallery">
        {metas.map((m) => urls[m.id] && <img key={m.id} className="thumb" src={urls[m.id]} onClick={() => setFullId(m.id)} alt="" />)}
      </div>
      {fullId && urls[fullId] && (
        <div className="overlay" onClick={() => setFullId(null)}>
          <img src={urls[fullId]} alt="" />
        </div>
      )}
    </>
  );
}
