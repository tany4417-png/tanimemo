import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { addImageFromBlob, getImageBlob } from "../lib/attachments";
import { flattenFolderTree, listAllFolders, moveNote } from "../lib/folders";
import { renderMarkdown, toggleCheckbox } from "../lib/markdown";
import type { Note } from "../lib/types";
import { BackIcon, ImageIcon } from "./icons";
import { useAttachmentUrls } from "./useAttachmentUrls";

type Props = {
  syncBar: React.ReactNode;
  note: Note;
  startEditing?: boolean;
  onChange: (patch: { body?: string; tags?: string[]; importance?: 0 | 1 | 2 | 3 }) => void;
  onDelete: () => void;
  onBack: () => void;
  onMoved: () => void;
  // 画像添付が完了したときに呼ばれる（App側でscheduleSyncするためのフック）
  onAttached?: () => void;
};

export function NoteScreen({ syncBar, note, startEditing, onChange, onDelete, onBack, onMoved, onAttached }: Props) {
  const [editing, setEditing] = useState(startEditing ?? false);
  const [draft, setDraft] = useState(note.body);
  const [movePickerOpen, setMovePickerOpen] = useState(false);
  const html = useMemo(() => renderMarkdown(note.body), [note.body]);
  const allFolders = useLiveQuery(listAllFolders, [], []);
  const flatFolders = useMemo(() => flattenFolderTree(allFolders), [allFolders]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  // 選択・ペーストされたファイルのうち画像だけをattachments経由で保存し、保存完了ごとにonAttachedで同期をスケジュールする
  async function attachFiles(files: Iterable<File>) {
    const images = [...files].filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    for (const f of images) await addImageFromBlob(note.id, f);
    onAttached?.();
  }

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files.length > 0) void attachFiles(files);
    e.target.value = ""; // 同じファイルを続けて選び直せるようにリセット
  }

  function onEditorPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = [...(e.clipboardData?.files ?? [])];
    if (files.some((f) => f.type.startsWith("image/"))) {
      e.preventDefault();
      void attachFiles(files);
    }
  }

  return (
    <div className="note">
      <div className="list-header">
        {syncBar}
        <div className="toolbar">
          <button className="icon-btn" onClick={onBack} aria-label="戻る">
            <BackIcon />
          </button>
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
          <button className="icon-btn" aria-label="写真を添付" onClick={() => fileInputRef.current?.click()}>
            <ImageIcon />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={onPickFiles}
          />
          {editing ? (
            <button className="primary" onClick={save}>保存</button>
          ) : (
            <button onClick={() => { setDraft(note.body); setEditing(true); }}>編集</button>
          )}
          <button className="danger" onClick={onDelete}>削除</button>
        </div>
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
        <textarea
          className="editor"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPaste={onEditorPaste}
        />
      ) : (
        <div className="note-view" onClick={clickView} dangerouslySetInnerHTML={{ __html: html }} />
      )}
      <Gallery noteId={note.id} />
    </div>
  );
}

export function Gallery({ noteId }: { noteId: string }) {
  // 一覧グリッドは軽いサムネイル、原寸オーバーレイだけ本体blobを使う（一覧・起動を重くしないため）
  const { metas, urls } = useAttachmentUrls(noteId, undefined, { thumb: true });
  const [fullId, setFullId] = useState<string | null>(null);
  const fullUrl = useFullImageUrl(fullId);

  return (
    <>
      <div className="gallery">
        {metas.map((m) => urls[m.id] && <img key={m.id} className="thumb" src={urls[m.id]} onClick={() => setFullId(m.id)} alt="" />)}
      </div>
      {fullId && fullUrl && (
        <div className="overlay" onClick={() => setFullId(null)}>
          <img src={fullUrl} alt="" />
        </div>
      )}
    </>
  );
}

// 原寸オーバーレイ表示中だけ、対象1件の本体blobを取りに行く（サムネと違い全件を先読みしない）
function useFullImageUrl(id: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!id) {
      setUrl(null);
      return;
    }
    let alive = true;
    let created: string | null = null;
    void (async () => {
      const token = localStorage.getItem("tanimemo.token") ?? "";
      const blob = await getImageBlob(id, token);
      if (alive && blob) {
        created = URL.createObjectURL(blob);
        setUrl(created);
      }
    })();
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [id]);
  return url;
}
