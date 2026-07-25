// @vitest-environment jsdom
/// <reference types="node" />
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Blob as NodeBlob } from "node:buffer";
import { db, resetDbForTests } from "../lib/db";
import { CardThumbs } from "./CardThumbs";

// jsdomのBlobはfake-indexeddb（structuredCloneベース）を通すとプロパティが消えて
// 空オブジェクトになり、Blob URLの生成が壊れる。Node組み込みのBlobに差し替えて回避する
(globalThis as unknown as { Blob: typeof Blob }).Blob = NodeBlob as unknown as typeof Blob;

const att = (over: Partial<Parameters<typeof db.attachments.add>[0]> = {}) => ({
  id: "A1", noteId: "N1", mime: "image/png", size: 1, name: "a.png",
  createdAt: 1, updatedAt: 1, deleted: 0 as const, dirty: 0 as const, ...over,
});

describe("CardThumbs", () => {
  beforeEach(async () => { await resetDbForTests(); });

  it("非画像添付はサムネのimgを作らずクリップバッジを出す", async () => {
    await db.attachments.add(att({ id: "A1", mime: "application/pdf", name: "見積書.pdf" }));
    await db.attachmentBlobs.add({ id: "A1", blob: new Blob([new Uint8Array([1])], { type: "application/pdf" }) });
    render(<CardThumbs noteId="N1" />);
    await screen.findByLabelText("添付ファイル1件");
    expect(document.querySelectorAll("img.card-thumb").length).toBe(0);
  });

  it("画像添付はサムネのimgを出す", async () => {
    await db.attachments.add(att({ id: "A2", noteId: "N1" }));
    await db.attachmentBlobs.add({ id: "A2:thumb", blob: new Blob([new Uint8Array([1])], { type: "image/jpeg" }) });
    render(<CardThumbs noteId="N1" />);
    await vi.waitFor(() => expect(document.querySelectorAll("img.card-thumb").length).toBe(1));
  });
});
