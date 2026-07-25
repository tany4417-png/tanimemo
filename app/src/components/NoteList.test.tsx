// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, createEvent } from "@testing-library/react";
import { resetDbForTests } from "../lib/db";
import { NoteList } from "./NoteList";

// 外部（エクスプローラ等）からのドロップ用の疑似DataTransfer。filedrop.test.tsのdt()と同じ形
function dt(files: File[], types: string[] = ["Files"]): DataTransfer {
  return { files: files as unknown as FileList, types } as unknown as DataTransfer;
}

const baseProps = {
  syncBar: null,
  notes: [],
  sort: "created",
  onSort: () => {},
  query: "",
  onQuery: () => {},
  onOpen: () => {},
  onCreate: () => {},
  onDelete: () => {},
  isBrowsingFolder: true,
  currentFolderId: null,
  slideClass: "",
  folderPath: [],
  childFolders: [],
  onOpenFolder: () => {},
  onNavigateUp: () => {},
  onBack: () => {},
  onOpenReminders: () => {},
  onCreateFolder: () => {},
  onRenameCurrentFolder: () => {},
  onDeleteFolder: () => {},
  onMoveNote: () => {},
  onMoveFolder: () => {},
  onReorderNote: () => {},
  onReorderFolder: () => {},
  onDropFiles: () => {},
} as unknown as React.ComponentProps<typeof NoteList>;

describe("NoteList 外部ファイルのドロップ", () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  it("ファイルのドラッグオーバーでfile-drop-activeが付く", () => {
    const { container } = render(<NoteList {...baseProps} />);
    const root = container.querySelector(".list.screen")!;
    fireEvent.dragOver(root, { dataTransfer: dt([]) });
    expect(root.className).toContain("file-drop-active");
  });

  it("テキストのドラッグ（メモ内のテキスト選択など）ではfile-drop-activeが付かない", () => {
    const { container } = render(<NoteList {...baseProps} />);
    const root = container.querySelector(".list.screen")!;
    fireEvent.dragOver(root, { dataTransfer: dt([], ["text/plain"]) });
    expect(root.className).not.toContain("file-drop-active");
  });

  // jsdomはDragEvent自体を実装しておらず、fireEventのinit経由のrelatedTargetは黙って落ちる
  // （NoteScreen.test.tsxと同じ理由）。createEventで素のイベントを作りrelatedTargetを直接載せる
  it("枠外へのdragLeaveで消える", () => {
    const { container } = render(<NoteList {...baseProps} />);
    const root = container.querySelector(".list.screen")!;
    fireEvent.dragOver(root, { dataTransfer: dt([]) });
    const leaveEvent = createEvent.dragLeave(root);
    Object.defineProperty(leaveEvent, "relatedTarget", { value: document.body });
    fireEvent(root, leaveEvent);
    expect(root.className).not.toContain("file-drop-active");
  });

  it("ドロップでonDropFilesが呼ばれ、枠が消える", () => {
    const onDropFiles = vi.fn();
    const { container } = render(<NoteList {...baseProps} onDropFiles={onDropFiles} />);
    const root = container.querySelector(".list.screen")!;
    const f = new File([new Uint8Array([1])], "a.pdf", { type: "application/pdf" });
    fireEvent.dragOver(root, { dataTransfer: dt([f]) });
    fireEvent.drop(root, { dataTransfer: dt([f]) });
    expect(root.className).not.toContain("file-drop-active");
    expect(onDropFiles).toHaveBeenCalledTimes(1);
    expect(onDropFiles.mock.calls[0][0]).toHaveLength(1);
  });
});
