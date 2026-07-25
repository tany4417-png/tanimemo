// @vitest-environment jsdom
/// <reference types="node" />
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Blob as NodeBlob } from "node:buffer";
import { db, resetDbForTests } from "../lib/db";
import { AttachmentFiles } from "./AttachmentFiles";

// jsdomのBlobはfake-indexeddb（structuredCloneベース）を通すとプロパティが消えて
// 空オブジェクトになり、Blob URLの生成が壊れる。Node組み込みのBlobに差し替えて回避する
(globalThis as unknown as { Blob: typeof Blob }).Blob = NodeBlob as unknown as typeof Blob;

const base = { noteId: "N1", size: 2048, createdAt: 1, updatedAt: 1, deleted: 0 as const, dirty: 0 as const };

describe("AttachmentFiles", () => {
  beforeEach(async () => { await resetDbForTests(); });

  it("ファイル名・拡張子・サイズを出す", async () => {
    await db.attachments.add({ ...base, id: "A1", mime: "application/pdf", name: "見積書.pdf" });
    await db.attachmentBlobs.add({ id: "A1", blob: new Blob([new Uint8Array([1])], { type: "application/pdf" }) });
    render(<AttachmentFiles noteId="N1" />);
    await screen.findByText("見積書.pdf");
    expect(screen.getByText("PDF")).toBeTruthy();
    expect(screen.getByText("2 KB")).toBeTruthy();
  });

  it("画像添付は出さない", async () => {
    await db.attachments.add({ ...base, id: "A2", mime: "image/png", name: "写真.png" });
    await db.attachmentBlobs.add({ id: "A2", blob: new Blob([new Uint8Array([1])], { type: "image/png" }) });
    render(<AttachmentFiles noteId="N1" />);
    await vi.waitFor(() => expect(screen.queryByText("写真.png")).toBeNull());
  });

  it("showDeleteのとき✕でonDeleteAttachmentが呼ばれる", async () => {
    await db.attachments.add({ ...base, id: "A3", mime: "application/pdf", name: "a.pdf" });
    await db.attachmentBlobs.add({ id: "A3", blob: new Blob([new Uint8Array([1])], { type: "application/pdf" }) });
    const onDelete = vi.fn();
    render(<AttachmentFiles noteId="N1" showDelete onDeleteAttachment={onDelete} />);
    await screen.findByText("a.pdf");
    screen.getByRole("button", { name: "このファイルを削除" }).click();
    expect(onDelete).toHaveBeenCalledWith("A3");
  });
});
