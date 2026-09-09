import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { addAttachments, rejectedMessage } from "../lib/attachments";
import { copyText } from "../lib/clipboard";
import { accentClassFor } from "../lib/colors";
import { filesFromDataTransfer, hasFiles } from "../lib/filedrop";
import { flattenFolderTree, listAllFolders } from "../lib/folders";
import { canRedo, canUndo, histInit, histPush, histRedo, histUndo, type Hist } from "../lib/history";
import { highlightMatches } from "../lib/highlight";
import { firstLineTitle, renderMarkdown, toggleCheckbox } from "../lib/markdown";
import type { Note } from "../lib/types";
import { charPosFromScroll, collectBlocks, pickForPos, pickTopVisible, scrollTopForCharPos } from "../lib/srcpos";
import { scrollHideStep, type ScrollHideState } from "../lib/viewport";
import { AttachmentFiles } from "./AttachmentFiles";
import { CloseIcon } from "./icons";
import { ImageOverlay, onImageDragStart } from "./ImageOverlay";
import { NoteHeader } from "./NoteHeader";
import { NoteMenuSheet } from "./NoteMenuSheet";
import { ReminderSheet } from "./ReminderSheet";
import { useAttachmentUrls } from "./useAttachmentUrls";

// 編集中の変更確定までの猶予（ms）。この間隔だけ入力が途切れたら、その時点のdraftを1スナップショットとしてhistoryへ積む
const HISTORY_COALESCE_MS = 600;
// 自動保存のデバウンス（ms）。入力がこの間隔だけ途切れたら未保存のdraftをDBへ書く
const AUTOSAVE_MS = 600;
// 全文コピーの結果をボタン上に出しておく時間（ms）。アプリにトースト機構が無いのでボタン自身で知らせる
const COPY_FEEDBACK_MS = 2000;

type Props = {
  syncBar: React.ReactNode;
  // 画面切替（list/note/settings/trash）のスライドインクラス（slide-in-left/right）。ルート要素(.screen)に直接付ける
  slideClass: string;
  note: Note;
  startEditing?: boolean;
  // リマインダーフォルダの「新規」から来たとき、リマインダーシートを開いた状態で始める
  startWithReminder?: boolean;
  onChange: (patch: { body?: string; importance?: 0 | 1 | 2 | 3; remindAt?: number | null; repeatRule?: string | null }) => void;
  onDelete: () => void;
  onBack: () => void;
  // メモの移動（移動ピッカーで選んだ先）。App側でundo登録・同期スケジュールまで面倒を見る
  onMoveNote: (noteId: string, folderId: string | null) => void;
  // 画像添付が完了したときに呼ばれる（App側でscheduleSyncするためのフック）
  onAttached?: () => void;
  // 添付1枚の個別削除。App側でundo登録・同期スケジュールまで面倒を見る
  onDeleteAttachment: (attId: string) => void;
  // 検索から開いたときのハイライト・ジャンプ用クエリ。空なら何もしない
  highlightQuery?: string;
  // 自動保存。App側でupdateNote＋scheduleSyncのみ行い、グローバルundoには積まない
  onAutoSave: (body: string) => Promise<void>;
  // 編集セッション（編集開始〜完了/戻る）終了時、開始時と本文が変わっていた場合のみ呼ぶ。
  // App側でグローバルundoに1エントリ積む（細かい取り消しは編集中のローカルundo/redoが担当）
  onEditSessionEnd: (before: string, after: string) => void;
  // 「戻る」系遷移（バックスワイプ含む）の前にAppが未保存分をflushするための公開窓口。
  // performBack側はこれをawaitしてからdiscardIfEmptyNewを呼ぶ（物理削除と自動保存のレース防止）
  flushRef: React.RefObject<(() => Promise<void>) | null>;
};

export function NoteScreen({ syncBar, slideClass, note, startEditing, startWithReminder, onChange, onDelete, onBack, onMoveNote, onAttached, onDeleteAttachment, highlightQuery, onAutoSave, onEditSessionEnd, flushRef }: Props) {
  const [editing, setEditing] = useState(startEditing ?? false);
  const [draft, setDraft] = useState(note.body);
  const [menuOpen, setMenuOpen] = useState(false);
  const [movePickerOpen, setMovePickerOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(startWithReminder ?? false);
  // 外部（エクスプローラ等）からのファイルドロップ中かどうか。枠線表示のみに使う
  const [dropActive, setDropActive] = useState(false);
  // 全文コピーの結果表示。ok/ngをCOPY_FEEDBACK_MSだけ出してidleへ戻す
  const [copyState, setCopyState] = useState<"idle" | "ok" | "ng">("idle");
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const html = useMemo(() => renderMarkdown(note.body), [note.body]);
  // dangerouslySetInnerHTMLに渡す{__html}はオブジェクトごとメモ化する。React 19は参照が変わると
  // 文字列が同値でもinnerHTMLを再設定するため、インライン生成だと無関係な再レンダー（allFolders到着等）で
  // ハイライトeffectが付けた<mark>が毎回消えてしまう
  const htmlObj = useMemo(() => ({ __html: html }), [html]);
  const allFolders = useLiveQuery(listAllFolders, [], []);
  const flatFolders = useMemo(() => flattenFolderTree(allFolders), [allFolders]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const anyFileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const viewRef = useRef<HTMLDivElement | null>(null);
  // ジャンプ（scrollIntoView）は初回表示の1回だけ。チェックボックス切替等でhtmlが変わって
  // 再ハイライトしても、読んでいる位置を勝手に動かさない
  const jumpedRef = useRef(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  // 編集モードに入るとき、原文のどこを見せるか。focus=trueならキーボードも出す
  // （本文をタップして入った場合。編集ボタン経由では出さない）
  const pendingEditRef = useRef<{ pos: number; focus: boolean } | null>(
    (startEditing ?? false) ? { pos: 0, focus: true } : null
  );
  // 編集をやめるとき、編集欄で見ていた原文の位置。閲覧側の同じ場所へ寄せるために持ち越す
  const leavePosRef = useRef<number | null>(null);
  // ヘッダーをスクロールで隠す状態。判定用の位置はrefで持ち、classの付け外しだけstateにする
  const [headerHidden, setHeaderHidden] = useState(false);
  const hideStateRef = useRef<ScrollHideState>({ visible: true, lastTop: 0 });

  // undo/redo履歴。editing中だけ使い、historyRef自体はrefなので更新してもrenderされない。
  // canUndo/canRedoの表示（ボタンのdisabled）を更新するためだけに、値は使わずsetHistoryTickでrenderを誘発する
  const historyRef = useRef<Hist>(histInit(note.body));
  const [, setHistoryTick] = useState(0);
  const coalesceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 自動保存の状態。lastSaved=最後にDBへ書いた本文（note.bodyと比べない: 編集中に同期で
  // note.bodyが変わっても自動保存の判定を乱さないため）。sessionStart=編集セッション開始時の本文。
  const lastSavedRef = useRef(note.body);
  const sessionStartRef = useRef(note.body);
  // visibilitychange・flushRef・unmountクロージャから最新値を読むためのref
  const draftRef = useRef(draft);
  const editingRef = useRef(editing);
  useEffect(() => {
    draftRef.current = draft;
    editingRef.current = editing;
  });

  useEffect(() => {
    return () => {
      if (coalesceTimer.current) clearTimeout(coalesceTimer.current);
      if (copyTimerRef.current != null) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // 閲覧モードの本文に検索ヒットのハイライトを付け、最初のヒットへスクロールする。
  // dangerouslySetInnerHTMLはhtmlが変わらない限りDOMを再設定しないため、付けたmarkは再レンダーで消えない。
  // htmlが変わったとき（チェックボックス切替など）はinnerHTMLが素に戻るので、このeffectが付け直す
  useEffect(() => {
    if (editing) return;
    const root = viewRef.current;
    const q = (highlightQuery ?? "").trim();
    if (!root || !q) return;
    const first = highlightMatches(root, q);
    if (first && !jumpedRef.current) {
      jumpedRef.current = true;
      first.scrollIntoView({ block: "center" });
    }
  }, [html, editing, highlightQuery]);

  // 閲覧⇔編集の切替後、同じ場所を見せ直す。描画済みの位置が要るのでlayout effectで行う
  useLayoutEffect(() => {
    if (editing) {
      const pending = pendingEditRef.current;
      pendingEditRef.current = null;
      const ta = textareaRef.current;
      if (!pending || !ta) return;
      // textareaは等幅で流し込むだけなので、文字数の比率でおおよその位置に合う
      ta.scrollTop = scrollTopForCharPos(ta, pending.pos, ta.value.length);
      if (pending.focus) {
        // カーソルを置いてからフォーカスすると、ブラウザがその位置を見える所まで運んでくれる
        ta.setSelectionRange(pending.pos, pending.pos);
        ta.focus();
      }
      return;
    }
    const pos = leavePosRef.current;
    leavePosRef.current = null;
    const view = viewRef.current;
    const body = bodyRef.current;
    if (pos == null || !view || !body) return;
    const block = pickForPos(collectBlocks(view, body.getBoundingClientRect().top), pos);
    if (block) body.scrollTop += block.top;
  }, [editing]);

  // 編集中はヘッダーを隠さない（textarea内スクロールでは出し入れの操作ができず、戻れなくなるため）
  useEffect(() => {
    if (!editing) return;
    hideStateRef.current = { visible: true, lastTop: 0 };
    setHeaderHidden(false);
  }, [editing]);

  // 編集中、入力がAUTOSAVE_MSだけ途切れたら未保存のdraftをDBへ書く。
  // undo/redoボタン経由のdraft変更もこのeffectが自然に拾う
  useEffect(() => {
    if (!editing) return;
    if (draft === lastSavedRef.current) return;
    const t = setTimeout(() => {
      lastSavedRef.current = draft;
      void onAutoSave(draft);
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [draft, editing, onAutoSave]);

  // 未保存分の即時保存。編集中でなければ・未保存分が無ければno-op
  async function flushDraft() {
    if (!editingRef.current) return;
    if (draftRef.current === lastSavedRef.current) return;
    lastSavedRef.current = draftRef.current;
    await onAutoSave(draftRef.current);
  }

  // Appの戻り遷移（ボタン・バックスワイプ）がflushしてからdiscardIfEmptyNewできるよう窓口を公開する
  useEffect(() => {
    flushRef.current = flushDraft;
    return () => {
      flushRef.current = null;
    };
  });

  // アプリ切替・タブ非表示のタイミングでも未保存分を保存する（PWAはバックグラウンドでプロセスが落ち得る）
  useEffect(() => {
    if (!editing) return;
    const onVis = () => {
      if (document.visibilityState === "hidden") void flushDraft();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // flushDraftはref経由で最新を読むため依存に入れない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  // 編集したまま画面を離れた（戻る・削除等でunmount）場合のセッション終了。
  // 保存自体はperformBack側のflushRef経由（またはデバウンス済み）で済んでいる前提で、undoエントリだけ積む
  useEffect(() => {
    return () => {
      if (editingRef.current && draftRef.current !== sessionStartRef.current) {
        onEditSessionEnd(sessionStartRef.current, draftRef.current);
      }
    };
    // マウント時のonEditSessionEndを使う（note.idはこの画面の生存中不変）
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // 全文コピー。編集中は保存前のdraft、閲覧中はnote.bodyを、1行目のタイトルごとそのまま渡す
  async function copyAll() {
    const ok = await copyText(editing ? draft : note.body);
    setCopyState(ok ? "ok" : "ng");
    if (copyTimerRef.current != null) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopyState("idle"), COPY_FEEDBACK_MS);
  }

  // 本文のスクロールに合わせてヘッダーを出し入れする。編集中は対象外
  function onBodyScroll(e: React.UIEvent<HTMLDivElement>) {
    if (editing) return;
    const next = scrollHideStep(hideStateRef.current, e.currentTarget.scrollTop);
    hideStateRef.current = next;
    setHeaderHidden(!next.visible);
  }

  // 原文のposの位置から編集を始める。focus=trueならその場にカーソルを置いてキーボードを出す
  function startEditAt(pos: number, focus: boolean) {
    pendingEditRef.current = { pos, focus };
    if (coalesceTimer.current) {
      clearTimeout(coalesceTimer.current);
      coalesceTimer.current = null;
    }
    setDraft(note.body);
    lastSavedRef.current = note.body;
    sessionStartRef.current = note.body;
    historyRef.current = histInit(note.body);
    setHistoryTick(0);
    setEditing(true);
  }

  // 編集ボタン。いま画面の上端に見えている段落から始め、キーボードは出さない
  function startEdit() {
    const view = viewRef.current;
    const body = bodyRef.current;
    const blocks = view && body ? collectBlocks(view, body.getBoundingClientRect().top) : [];
    startEditAt(pickTopVisible(blocks, 0) ?? 0, false);
  }

  // 「完了」: 未保存分を保存し、セッションundoエントリを確定して閲覧モードへ戻る
  function finishEditing() {
    if (textareaRef.current) leavePosRef.current = charPosFromScroll(textareaRef.current, draft.length);
    if (coalesceTimer.current) {
      clearTimeout(coalesceTimer.current);
      coalesceTimer.current = null;
    }
    if (draft !== lastSavedRef.current) {
      lastSavedRef.current = draft;
      void onAutoSave(draft);
    }
    if (draft !== sessionStartRef.current) {
      onEditSessionEnd(sessionStartRef.current, draft);
      sessionStartRef.current = draft;
    }
    setEditing(false);
    // メモをまたいで持ち越さないよう、編集終了でhistoryは破棄する
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
      return;
    }
    if (t.closest("a")) return; // リンクはそのまま開かせる
    // タップした段落の原文位置から編集を始める。data-srcはrenderMarkdownがブロックごとに入れている
    const block = t.closest<HTMLElement>("[data-src]");
    startEditAt(Number(block?.dataset.src ?? 0), true);
  }

  // 選択・ペースト・ドロップされたファイルを種類を問わず保存し、完了ごとにonAttachedで同期をスケジュールする。
  // 上限超過分は保存せず、最後にまとめて件数を知らせる
  async function attachFiles(files: Iterable<File>) {
    const list = [...files];
    if (list.length === 0) return;
    const rejected = await addAttachments(note.id, list);
    if (rejected > 0) alert(rejectedMessage(rejected));
    onAttached?.();
  }

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files.length > 0) void attachFiles(files);
    e.target.value = ""; // 同じファイルを続けて選び直せるようにリセット
  }

  function onEditorPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = [...(e.clipboardData?.files ?? [])];
    if (files.length > 0) {
      e.preventDefault();
      void attachFiles(files);
    }
  }

  // 外部（エクスプローラ等）からのHTML5ドロップ受け入れ。カード並べ替え・フォルダ移動の既存D&D
  // （SwipeableCard・dnd.ts）はpointerイベント系なので系統が別で競合しない
  function onDragOver(e: React.DragEvent) {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    setDropActive(true);
  }
  function onDragLeave(e: React.DragEvent) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDropActive(false);
  }
  function onDrop(e: React.DragEvent) {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    setDropActive(false);
    void attachFiles(filesFromDataTransfer(e.dataTransfer));
  }

  return (
    <div
      className={`note screen ${slideClass}${editing ? " editing" : ""}${dropActive ? " file-drop-active" : ""}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <NoteHeader
        title={firstLineTitle(note.body)}
        editing={editing}
        hidden={headerHidden}
        canUndo={canUndo(historyRef.current)}
        canRedo={canRedo(historyRef.current)}
        onBack={onBack}
        onEdit={startEdit}
        onUndo={undo}
        onRedo={redo}
        onFinish={finishEditing}
        onMenu={() => setMenuOpen((v) => !v)}
      />
      {/* ファイル選択のinputはメニューの開閉と無関係に生かしておく（メニューを閉じても選択ダイアログは続くため） */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={onPickFiles}
      />
      {/* accept無し＝PDF・Excel等どれでも。iOSでは「写真」「ブラウズ」の選択が出る */}
      <input
        ref={anyFileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={onPickFiles}
      />
      {/* ヘッダー直下に重ねる層。本文を押し下げないよう浮かせる（pointer-eventsは中身だけ有効） */}
      <div className="note-sheets">
        {/* メニュー・移動ピッカーの外側をタップして閉じるための受け皿。
            リマインダー設定は入力途中の誤タップで消したくないので対象外にする */}
        {(menuOpen || movePickerOpen) && (
          <div
            className="note-sheet-backdrop"
            onClick={() => {
              setMenuOpen(false);
              setMovePickerOpen(false);
            }}
          />
        )}
        {menuOpen && (
          <NoteMenuSheet
            syncBar={syncBar}
            importance={note.importance}
            reminderOn={(note.remindAt ?? null) != null}
            copyState={copyState}
            onImportance={(v) => onChange({ importance: v })}
            onPickImage={() => {
              setMenuOpen(false);
              fileInputRef.current?.click();
            }}
            onPickFile={() => {
              setMenuOpen(false);
              anyFileInputRef.current?.click();
            }}
            onReminder={() => {
              setMenuOpen(false);
              setReminderOpen(true);
            }}
            onMove={() => {
              setMenuOpen(false);
              setMovePickerOpen((v) => !v);
            }}
            onCopy={() => void copyAll()}
            onDelete={() => {
              setMenuOpen(false);
              onDelete();
            }}
          />
        )}
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
        {reminderOpen && (
          <ReminderSheet
            note={note}
            onClose={() => setReminderOpen(false)}
            onSave={(remindAt, repeatRule) => {
              onChange({ remindAt, repeatRule });
              setReminderOpen(false);
            }}
          />
        )}
      </div>
      {/* ヘッダー（・移動ピッカー・リマインダーシート）以外＝本文・ギャラリーだけがスクロール＆バウンドする */}
      <div className="screen-body" ref={bodyRef} onScroll={onBodyScroll}>
        {/* 内容が短くてもラバーバンドさせるため、中身全体を.bounce-areaで1枚ラップする（常にコンテナ＋1pxの高さ） */}
        <div className="bounce-area">
          {editing ? (
            <>
              {/* 編集中は貼った画像がすぐ見えるよう、ギャラリーを本文入力欄の上に置く（2026-07-21 オーナー要望）。
                  ×バッジ（1枚ずつ削除）も編集中だけ出す */}
              <Gallery noteId={note.id} showDeleteBadges onDeleteAttachment={onDeleteAttachment} />
              <AttachmentFiles noteId={note.id} showDelete onDeleteAttachment={onDeleteAttachment} />
              <textarea
                ref={textareaRef}
                className="editor"
                value={draft}
                onChange={onDraftChange}
                onPaste={onEditorPaste}
              />
            </>
          ) : (
            <>
              {/* 本文が空のメモでは本文カードを出さない（空の枠だけ残ると小さな入力欄に見えるため）。
                  閲覧時の並びは文書として読む順を優先し、従来どおり本文→画像のまま */}
              {note.body.trim() !== "" && (
                <div ref={viewRef} className="note-view" onClick={clickView} dangerouslySetInnerHTML={htmlObj} />
              )}
              <Gallery noteId={note.id} onDeleteAttachment={onDeleteAttachment} />
              <AttachmentFiles noteId={note.id} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function Gallery({
  noteId,
  showDeleteBadges,
  onDeleteAttachment,
}: {
  noteId: string;
  // 編集中だけ各サムネの角に×バッジ（1枚ずつ削除）を出す
  showDeleteBadges?: boolean;
  onDeleteAttachment?: (attId: string) => void;
}) {
  // 一覧グリッドは軽いサムネイル、原寸オーバーレイだけ本体blobを使う（一覧・起動を重くしないため）
  const { metas, urls } = useAttachmentUrls(noteId, undefined, { thumb: true, kind: "image" });
  // OSへのドラッグアウト用に、原寸blobのobjectURLも別途用意する（サムネのままだと画質が粗いため）。
  // 未取得（オフライン等でfetchが失敗した添付）はurlsに入らず、その添付はドラッグアウト無効のまま表示される
  const { urls: fullUrls } = useAttachmentUrls(noteId, undefined, { thumb: false, kind: "image" });
  const [fullId, setFullId] = useState<string | null>(null);

  return (
    <>
      <div className="gallery">
        {metas.map(
          (m) =>
            urls[m.id] && (
              <span key={m.id} className={`thumb-wrap${m.id.startsWith("staffportrait") ? " staff-portrait-wrap" : ""}`}>
                <img
                  className={`thumb${m.id.startsWith("staffportrait") ? " staff-portrait" : ""}`}
                  src={urls[m.id]}
                  onClick={() => setFullId(m.id)}
                  draggable={Boolean(fullUrls[m.id])}
                  onDragStart={(e) => onImageDragStart(e, m, fullUrls[m.id])}
                  alt=""
                />
                {showDeleteBadges && onDeleteAttachment && (
                  <button className="thumb-x" aria-label="この画像を削除" onClick={() => onDeleteAttachment(m.id)}>
                    <CloseIcon size={14} />
                  </button>
                )}
              </span>
            )
        )}
      </div>
      {/* 原寸表示（ズーム対応・body直下ポータル）はImageOverlayに分離 */}
      {(() => {
        const m = fullId ? metas.find((mm) => mm.id === fullId) : undefined;
        return m ? <ImageOverlay att={m} onClose={() => setFullId(null)} onDelete={onDeleteAttachment} /> : null;
      })()}
    </>
  );
}
