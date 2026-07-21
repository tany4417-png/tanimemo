import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { addImageFromBlob, getImageBlob } from "../lib/attachments";
import { accentClassFor } from "../lib/colors";
import { flattenFolderTree, listAllFolders } from "../lib/folders";
import { canRedo, canUndo, histInit, histPush, histRedo, histUndo, type Hist } from "../lib/history";
import { renderMarkdown, toggleCheckbox } from "../lib/markdown";
import type { Note } from "../lib/types";
import { BackIcon, ImageIcon, RedoIcon, UndoIcon } from "./icons";
import { useAttachmentUrls } from "./useAttachmentUrls";

// 編集中の変更確定までの猶予（ms）。この間隔だけ入力が途切れたら、その時点のdraftを1スナップショットとしてhistoryへ積む
const HISTORY_COALESCE_MS = 600;

type Props = {
  syncBar: React.ReactNode;
  note: Note;
  startEditing?: boolean;
  onChange: (patch: { body?: string; tags?: string[]; importance?: 0 | 1 | 2 | 3 }) => void;
  onDelete: () => void;
  onBack: () => void;
  // メモの移動（移動ピッカーで選んだ先）。App側でundo登録・同期スケジュールまで面倒を見る
  onMoveNote: (noteId: string, folderId: string | null) => void;
  // 画像添付が完了したときに呼ばれる（App側でscheduleSyncするためのフック）
  onAttached?: () => void;
};

export function NoteScreen({ syncBar, note, startEditing, onChange, onDelete, onBack, onMoveNote, onAttached }: Props) {
  const [editing, setEditing] = useState(startEditing ?? false);
  const [draft, setDraft] = useState(note.body);
  const [movePickerOpen, setMovePickerOpen] = useState(false);
  const html = useMemo(() => renderMarkdown(note.body), [note.body]);
  const allFolders = useLiveQuery(listAllFolders, [], []);
  const flatFolders = useMemo(() => flattenFolderTree(allFolders), [allFolders]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // undo/redo履歴。editing中だけ使い、historyRef自体はrefなので更新してもrenderされない。
  // canUndo/canRedoの表示（ボタンのdisabled）を更新するためだけに、値は使わずsetHistoryTickでrenderを誘発する
  const historyRef = useRef<Hist>(histInit(note.body));
  const [, setHistoryTick] = useState(0);
  const coalesceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (coalesceTimer.current) clearTimeout(coalesceTimer.current);
    };
  }, []);

  // 変更が続く間はタイマーを延長し、HISTORY_COALESCE_MSだけ途切れたらその時点のdraftを1スナップショットとして積む
  function scheduleSnapshot(next: string) {
    if (coalesceTimer.current) clearTimeout(coalesceTimer.current);
    coalesceTimer.current = setTimeout(() => {
      coalesceTimer.current = null;
      historyRef.current = histPush(historyRef.current, next);
      setHistoryTick((v) => v + 1);
    }, HISTORY_COALESCE_MS);
  }

  // undo/redo直前に未確定（coalescing待ち）の変更があれば、まずそれを1スナップショットとして積んでから操作する
  function flushPendingSnapshot() {
    if (coalesceTimer.current) {
      clearTimeout(coalesceTimer.current);
      coalesceTimer.current = null;
      historyRef.current = histPush(historyRef.current, draft);
    }
  }

  function onDraftChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    setDraft(next);
    scheduleSnapshot(next);
  }

  function undo() {
    flushPendingSnapshot();
    const h = histUndo(historyRef.current);
    historyRef.current = h;
    setDraft(h.present);
    setHistoryTick((v) => v + 1);
    textareaRef.current?.focus();
  }

  function redo() {
    flushPendingSnapshot();
    const h = histRedo(historyRef.current);
    historyRef.current = h;
    setDraft(h.present);
    setHistoryTick((v) => v + 1);
    textareaRef.current?.focus();
  }

  function startEdit() {
    if (coalesceTimer.current) {
      clearTimeout(coalesceTimer.current);
      coalesceTimer.current = null;
    }
    setDraft(note.body);
    historyRef.current = histInit(note.body);
    setHistoryTick(0);
    setEditing(true);
  }

  function save() {
    if (coalesceTimer.current) {
      clearTimeout(coalesceTimer.current);
      coalesceTimer.current = null;
    }
    onChange({ body: draft });
    setEditing(false);
    // メモをまたいで持ち越さないよう、保存・編集終了でhistoryは破棄する
    historyRef.current = histInit(draft);
    setHistoryTick(0);
  }

  function moveTo(folderId: string | null) {
    if (folderId === note.folderId) return;
    onMoveNote(note.id, folderId);
    setMovePickerOpen(false);
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
          <button className="tint acc-violet" onClick={() => setMovePickerOpen((v) => !v)}>移動…</button>
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
          {editing && (
            <>
              <button className="icon-btn" aria-label="取り消し" disabled={!canUndo(historyRef.current)} onClick={undo}>
                <UndoIcon />
              </button>
              <button className="icon-btn" aria-label="やり直し" disabled={!canRedo(historyRef.current)} onClick={redo}>
                <RedoIcon />
              </button>
            </>
          )}
          {editing ? (
            <button className="primary" onClick={save}>保存</button>
          ) : (
            <button className="tint acc-amber" onClick={startEdit}>編集</button>
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
              className={`folder-picker-item ${accentClassFor(folder.name)}${note.folderId === folder.id ? " disabled" : ""}`}
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
          ref={textareaRef}
          className="editor"
          autoFocus
          value={draft}
          onChange={onDraftChange}
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
