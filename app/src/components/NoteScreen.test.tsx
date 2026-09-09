// @vitest-environment jsdom
/// <reference types="node" />
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, createEvent } from "@testing-library/react";
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

// 添付・コピー・削除などはヘッダーの「その他の操作」の中にある
function openMenu() {
  fireEvent.click(screen.getByLabelText("その他の操作"));
}

describe("NoteScreen の添付ボタン", () => {
  it("写真ボタンとファイルボタンが両方あり、acceptが分かれている", () => {
    render(<NoteScreen {...props} />);
    openMenu();
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
    const child = root.querySelector(".note-header")!;
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

describe("NoteScreen の全文コピー", () => {
  function stubClipboard(writeText: (t: string) => Promise<void>) {
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  }

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    vi.useRealTimers();
  });

  it("閲覧中に押すと本文が1行目のタイトルごとコピーされる", async () => {
    const copied: string[] = [];
    stubClipboard(async (t) => { copied.push(t); });
    const long = { ...note, body: "見出し\n本文1行目\n本文2行目" };
    render(<NoteScreen {...props} note={long} />);
    openMenu();
    fireEvent.click(screen.getByLabelText("全文をコピー"));
    await screen.findByLabelText("コピーしました");
    expect(copied).toEqual(["見出し\n本文1行目\n本文2行目"]);
  });

  it("編集中は保存前の入力内容がコピーされる", async () => {
    const copied: string[] = [];
    stubClipboard(async (t) => { copied.push(t); });
    render(<NoteScreen {...props} startEditing />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "打ちかけの本文" } });
    openMenu();
    fireEvent.click(screen.getByLabelText("全文をコピー"));
    await screen.findByLabelText("コピーしました");
    expect(copied).toEqual(["打ちかけの本文"]);
  });

  it("コピーに失敗したらその旨を表示する", async () => {
    stubClipboard(async () => { throw new Error("NotAllowedError"); });
    render(<NoteScreen {...props} />);
    openMenu();
    fireEvent.click(screen.getByLabelText("全文をコピー"));
    await screen.findByLabelText("コピーできませんでした");
  });

  it("表示は2秒で元のラベルに戻る", async () => {
    vi.useFakeTimers();
    stubClipboard(async () => {});
    render(<NoteScreen {...props} />);
    openMenu();
    fireEvent.click(screen.getByLabelText("全文をコピー"));
    // copyTextのPromise解決をmicrotaskで進める（fake timers下ではfindByが使えない）
    await act(async () => {});
    expect(screen.getByLabelText("コピーしました")).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(screen.getByLabelText("全文をコピー")).toBeTruthy();
  });
});

describe("NoteScreen の1行ヘッダー", () => {
  it("本文の1行目をタイトルとして出す", () => {
    const { container } = render(<NoteScreen {...props} note={{ ...note, body: "見出し\n本文" }} />);
    expect(container.querySelector(".note-header-title")?.textContent).toBe("見出し");
  });

  it("使用頻度の低い操作はその他メニューを開くまで出さない", () => {
    render(<NoteScreen {...props} />);
    expect(screen.queryByLabelText("写真を添付")).toBeNull();
    expect(screen.queryByText("削除")).toBeNull();
    openMenu();
    expect(screen.getByLabelText("写真を添付")).toBeTruthy();
    expect(screen.getByText("削除")).toBeTruthy();
  });

  it("その他メニューの操作を選ぶとメニューが閉じる", () => {
    render(<NoteScreen {...props} />);
    openMenu();
    fireEvent.click(screen.getByText("移動…"));
    expect(screen.queryByLabelText("写真を添付")).toBeNull();
  });

  it("編集中は完了・取り消し・やり直しをヘッダーに出す", () => {
    const { container } = render(<NoteScreen {...props} startEditing />);
    const header = container.querySelector(".note-header")!;
    expect(header.textContent).toContain("完了");
    expect(header.querySelector('[aria-label="取り消し"]')).toBeTruthy();
    expect(header.querySelector('[aria-label="やり直し"]')).toBeTruthy();
  });

  it("ヘッダーの完了で閲覧モードへ戻る", () => {
    const { container } = render(<NoteScreen {...props} startEditing />);
    fireEvent.click(container.querySelector(".note-header button.primary")!);
    expect(screen.getByText("編集")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("閲覧中は取り消し・やり直しを出さない", () => {
    const { container } = render(<NoteScreen {...props} />);
    const header = container.querySelector(".note-header")!;
    expect(header.querySelector('[aria-label="取り消し"]')).toBeNull();
  });
});

describe("NoteScreen のタップ編集", () => {
  const body = "一行目\n\n二行目\n\n三行目";

  it("本文をタップすると、その段落から編集が始まる", () => {
    render(<NoteScreen {...props} note={{ ...note, body }} />);
    const target = document.querySelector<HTMLElement>(`[data-src="${body.indexOf("二行目")}"]`)!;
    fireEvent.click(target);
    const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(ta.selectionStart).toBe(body.indexOf("二行目"));
    expect(document.activeElement).toBe(ta);
  });

  it("タップした段落が変われば、始まる位置も変わる", () => {
    render(<NoteScreen {...props} note={{ ...note, body }} />);
    const target = document.querySelector<HTMLElement>(`[data-src="${body.indexOf("三行目")}"]`)!;
    fireEvent.click(target);
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).selectionStart).toBe(body.indexOf("三行目"));
  });

  it("リンクをタップしたときは編集に入らない（開くのを邪魔しない）", () => {
    render(<NoteScreen {...props} note={{ ...note, body: "[例](https://example.com)" }} />);
    fireEvent.click(document.querySelector("a")!);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("チェックボックスの切り替えでは編集に入らない", () => {
    const changed: string[] = [];
    render(
      <NoteScreen
        {...props}
        note={{ ...note, body: "- [ ] あ" }}
        onChange={(patch) => { if (patch.body != null) changed.push(patch.body); }}
      />
    );
    fireEvent.click(document.querySelector('input[type="checkbox"]')!);
    expect(changed).toEqual(["- [x] あ"]);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("編集ボタンから入ったときはキーボードを出さない", () => {
    render(<NoteScreen {...props} note={{ ...note, body }} />);
    fireEvent.click(screen.getByText("編集"));
    expect(document.activeElement).not.toBe(screen.getByRole("textbox"));
  });

  it("新規メモはこれから書くのでキーボードを出す", () => {
    render(<NoteScreen {...props} startEditing />);
    expect(document.activeElement).toBe(screen.getByRole("textbox"));
  });
});

describe("NoteScreen のスクロール", () => {
  it("下へスクロールするとヘッダーが隠れ、最上部へ戻すと出る", () => {
    const { container } = render(<NoteScreen {...props} />);
    const body = container.querySelector(".screen-body") as HTMLElement;
    const header = () => container.querySelector(".note-header")!.className;
    body.scrollTop = 300;
    fireEvent.scroll(body);
    expect(header()).toContain("hidden");
    body.scrollTop = 0;
    fireEvent.scroll(body);
    expect(header()).not.toContain("hidden");
  });

  it("編集中はヘッダーを隠さない（出し入れの操作ができないため）", () => {
    const { container } = render(<NoteScreen {...props} startEditing />);
    const body = container.querySelector(".screen-body") as HTMLElement;
    body.scrollTop = 300;
    fireEvent.scroll(body);
    expect(container.querySelector(".note-header")!.className).not.toContain("hidden");
  });
});

describe("NoteScreen のシート", () => {
  it("移動ピッカーは外側をタップすると閉じる", () => {
    const { container } = render(<NoteScreen {...props} />);
    openMenu();
    fireEvent.click(screen.getByText("移動…"));
    expect(screen.getByText("すべてのメモ")).toBeTruthy();
    fireEvent.click(container.querySelector(".note-sheet-backdrop")!);
    expect(screen.queryByText("すべてのメモ")).toBeNull();
  });

  it("その他メニューも外側をタップすると閉じる", () => {
    const { container } = render(<NoteScreen {...props} />);
    openMenu();
    fireEvent.click(container.querySelector(".note-sheet-backdrop")!);
    expect(screen.queryByLabelText("写真を添付")).toBeNull();
  });
});
