// @vitest-environment jsdom
/// <reference types="node" />
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, createEvent } from "@testing-library/react";
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import { NoteScreen } from "./NoteScreen";
import { db, resetDbForTests } from "../lib/db";
import type { Note } from "../lib/types";

// jsdomのBlobはfake-indexeddb（structuredCloneベース）を通すとプロパティが消えて
// 空オブジェクトになり、Blob URLの生成が壊れる。Node組み込みのBlobに差し替えて回避する
// （CardThumbs.test.tsxの先例）。ドロップはFileを経由するため、Fileも同じnode:bufferの実装に
// 揃えないとinstanceof Blobの食い違いで同じ壊れ方をする
(globalThis as unknown as { Blob: typeof Blob }).Blob = NodeBlob as unknown as typeof Blob;
(globalThis as unknown as { File: typeof File }).File = NodeFile as unknown as typeof File;

const note: Note = {
  id: "N1", body: "本文", importance: 0, createdAt: 1, updatedAt: 1, deleted: 0, dirty: 0,
  folderId: null, orderKey: null, remindAt: null, repeatRule: null,
};

const props = {
  syncBar: null, slideClass: "", note, startEditing: false, startWithReminder: false,
  onChange: () => {}, onDelete: () => {}, onBack: () => {}, onMoveNote: () => {},
  onDeleteAttachment: () => {}, highlightQuery: "", onAutoSave: () => {}, onEditSessionEnd: () => {},
  flushRef: { current: null },
} as unknown as React.ComponentProps<typeof NoteScreen>;

// 外部（エクスプローラ等）からのドロップ用の疑似DataTransfer。filedrop.test.tsのdt()と同じ形
function dt(files: File[], types: string[] = ["Files"]): DataTransfer {
  return { files: files as unknown as FileList, types } as unknown as DataTransfer;
}

describe("NoteScreen の添付ボタン", () => {
  it("写真ボタンとファイルボタンが両方あり、acceptが分かれている", () => {
    render(<NoteScreen {...props} />);
    expect(screen.getByLabelText("写真を添付")).toBeTruthy();
    expect(screen.getByLabelText("ファイルを添付")).toBeTruthy();
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'));
    expect(inputs.map((i) => i.getAttribute("accept"))).toEqual(["image/*", null]);
  });
});

describe("NoteScreen 外部ファイルのドロップ", () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  it("ファイルのドラッグオーバーでfile-drop-activeが付く", () => {
    const { container } = render(<NoteScreen {...props} />);
    const root = container.querySelector(".note.screen")!;
    fireEvent.dragOver(root, { dataTransfer: dt([]) });
    expect(root.className).toContain("file-drop-active");
  });

  it("テキストのドラッグ（メモ内のテキスト選択など）ではfile-drop-activeが付かない", () => {
    const { container } = render(<NoteScreen {...props} />);
    const root = container.querySelector(".note.screen")!;
    fireEvent.dragOver(root, { dataTransfer: dt([], ["text/plain"]) });
    expect(root.className).not.toContain("file-drop-active");
  });

  // jsdomはDragEvent自体を実装しておらず、fireEventのinit経由のrelatedTargetは黙って落ちる
  // （dataTransferだけはtesting-library側で特別扱いされている）。createEventで素のイベントを作った上で
  // relatedTargetをdefinePropertyで直接載せ、本物のドラッグに近い形で検証する
  it("枠内の子要素へのdragLeaveでは消えない", () => {
    const { container } = render(<NoteScreen {...props} />);
    const root = container.querySelector(".note.screen")!;
    fireEvent.dragOver(root, { dataTransfer: dt([]) });
    expect(root.className).toContain("file-drop-active");
    const child = root.querySelector(".list-header")!;
    const leaveEvent = createEvent.dragLeave(root);
    Object.defineProperty(leaveEvent, "relatedTarget", { value: child });
    fireEvent(root, leaveEvent);
    expect(root.className).toContain("file-drop-active");
  });

  it("枠外へのdragLeaveで消える", () => {
    const { container } = render(<NoteScreen {...props} />);
    const root = container.querySelector(".note.screen")!;
    fireEvent.dragOver(root, { dataTransfer: dt([]) });
    const leaveEvent = createEvent.dragLeave(root);
    Object.defineProperty(leaveEvent, "relatedTarget", { value: document.body });
    fireEvent(root, leaveEvent);
    expect(root.className).not.toContain("file-drop-active");
  });

  it("ドロップでファイルが添付され、枠が消える", async () => {
    const { container } = render(<NoteScreen {...props} />);
    const root = container.querySelector(".note.screen")!;
    const f = new File([new Uint8Array([1])], "a.pdf", { type: "application/pdf" });
    fireEvent.dragOver(root, { dataTransfer: dt([f]) });
    fireEvent.drop(root, { dataTransfer: dt([f]) });
    expect(root.className).not.toContain("file-drop-active");
    await vi.waitFor(async () => {
      expect(await db.attachments.where("noteId").equals(note.id).count()).toBe(1);
    });
  });
});
