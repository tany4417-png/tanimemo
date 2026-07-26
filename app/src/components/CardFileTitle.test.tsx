// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { db, resetDbForTests } from "../lib/db";
import { CardFileTitle } from "./CardFileTitle";

const att = (over: Record<string, unknown> = {}) => ({
  id: "A1",
  noteId: "N1",
  mime: "application/pdf",
  size: 1,
  name: "見積書.pdf",
  createdAt: 1,
  updatedAt: 1,
  deleted: 0 as const,
  dirty: 0 as const,
  ...over,
});

describe("CardFileTitle", () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  it("非画像添付のファイル名を出す", async () => {
    await db.attachments.add(att());
    render(<CardFileTitle noteId="N1" />);
    await screen.findByText("見積書.pdf");
  });

  it("2件以上あるときは1件目と「ほかN件」を出す", async () => {
    await db.attachments.bulkAdd([
      att({ id: "A1", name: "見積書.pdf" }),
      att({ id: "A2", name: "図面.pdf" }),
      att({ id: "A3", name: "表.xlsx" }),
    ]);
    render(<CardFileTitle noteId="N1" />);
    await screen.findByText("見積書.pdf");
    expect(screen.getByText("ほか2件")).toBeTruthy();
  });

  it("画像だけのメモには何も出さない（サムネイルで判別できるため）", async () => {
    await db.attachments.add(att({ id: "A1", mime: "image/png", name: "写真.png" }));
    const { container } = render(<CardFileTitle noteId="N1" />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector(".card-file-title")).toBeNull();
  });

  it("削除済みの添付は数えない", async () => {
    await db.attachments.add(att({ id: "A1", deleted: 1 as const }));
    const { container } = render(<CardFileTitle noteId="N1" />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector(".card-file-title")).toBeNull();
  });

  it("nameを持たない旧データはフォールバック名を出す", async () => {
    await db.attachments.add(att({ id: "A1", name: undefined, mime: "application/pdf", createdAt: new Date(2026, 6, 26, 9, 5).getTime() }));
    render(<CardFileTitle noteId="N1" />);
    await screen.findByText("ファイル-20260726-0905.bin");
  });
});
