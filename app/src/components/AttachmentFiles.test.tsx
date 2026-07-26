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

  // 2026-07-26 実バグの回帰: 非画像添付を行に描画しただけで実体を丸ごとダウンロードしていた
  // （メモを開いた瞬間に全件・原寸で先読み）。キャッシュ済みだけ即リンク化し、未キャッシュは
  // 「開く」「保存」を押すまでネットワークに出ないことを確認する
  describe("先読みしない（I-1）", () => {
    it("キャッシュ済みの添付は「開く」が即アンカー(リンク)になる", async () => {
      await db.attachments.add({ ...base, id: "A6", mime: "application/pdf", name: "cached.pdf" });
      await db.attachmentBlobs.add({ id: "A6", blob: new Blob([new Uint8Array([1])], { type: "application/pdf" }) });
      render(<AttachmentFiles noteId="N1" />);
      await screen.findByText("cached.pdf");
      await vi.waitFor(() => {
        const link = screen.getByRole("link", { name: "cached.pdfを開く" });
        expect(link.getAttribute("href")).toMatch(/^blob:/);
      });
    });

    it("未キャッシュの添付は描画時点でダウンロードが走らない（getImageBlob相当のfetchが呼ばれない）", async () => {
      await db.attachments.add({ ...base, id: "A5", mime: "application/pdf", name: "big.pdf" });
      // attachmentBlobsには何も入れない＝未キャッシュのまま
      const fetchSpy = vi.fn(
        async () => new Response(new Uint8Array([1]), { headers: { "Content-Type": "application/pdf" } })
      );
      vi.stubGlobal("fetch", fetchSpy);
      try {
        render(<AttachmentFiles noteId="N1" />);
        await screen.findByText("big.pdf");
        // useEffectが一巡してもfetchは呼ばれていない（先読みしていない）
        await new Promise((r) => setTimeout(r, 0));
        expect(fetchSpy).not.toHaveBeenCalled();
        // まだURL化されていないので「開く」はボタン（アンカーではない）
        expect(screen.getByRole("button", { name: "big.pdfを開く" })).toBeTruthy();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("未キャッシュの添付は「開く」押下で取りに行き、取得中はラベルが変わり、完了後はリンクになる", async () => {
      await db.attachments.add({ ...base, id: "A7", mime: "application/pdf", name: "later.pdf" });
      const fetchSpy = vi.fn(
        async () => new Response(new Uint8Array([1]), { headers: { "Content-Type": "application/pdf" } })
      );
      vi.stubGlobal("fetch", fetchSpy);
      try {
        render(<AttachmentFiles noteId="N1" />);
        const btn = await screen.findByRole("button", { name: "later.pdfを開く" });
        btn.click();
        await screen.findByText("取得中…");
        await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
        await vi.waitFor(() => expect(screen.getByRole("link", { name: "later.pdfを開く" })).toBeTruthy());
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});
