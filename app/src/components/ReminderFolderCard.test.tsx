// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { db, resetDbForTests } from "../lib/db";
import { ReminderFolderCard } from "./ReminderFolderCard";

const base = { importance: 0 as const, createdAt: 1, updatedAt: 1, deleted: 0 as const,
  dirty: 0 as const, folderId: null, orderKey: null, repeatRule: null };

const titleEls = () => Array.from(document.querySelectorAll<HTMLElement>(".reminder-titles li"));

describe("ReminderFolderCard", () => {
  beforeEach(async () => { await resetDbForTests(); });

  it("リマインダーのタイトルが次に鳴る順に小さく表示される（件数表示は従来どおり）", async () => {
    const now = Date.now();
    await db.notes.bulkAdd([
      { ...base, id: "a", body: "あとのメモ", remindAt: now + 7200_000 },
      { ...base, id: "b", body: "さきのメモ", remindAt: now + 3600_000 },
    ]);
    render(<ReminderFolderCard onOpen={() => {}} />);
    await screen.findByText("さきのメモ");
    const items = titleEls();
    expect(items[0].textContent).toBe("さきのメモ");
    expect(items[1].textContent).toBe("あとのメモ");
    expect(screen.getByText("2件")).toBeTruthy();
  });

  it("4件以上は3件＋「ほか N件」に畳む", async () => {
    const now = Date.now();
    await db.notes.bulkAdd([1, 2, 3, 4, 5].map((i) => ({
      ...base, id: `n${i}`, body: `メモ${i}`, remindAt: now + i * 3600_000,
    })));
    render(<ReminderFolderCard onOpen={() => {}} />);
    await screen.findByText("メモ1");
    expect(screen.getByText("メモ2")).toBeTruthy();
    expect(screen.getByText("メモ3")).toBeTruthy();
    expect(screen.queryByText("メモ4")).toBeNull();
    expect(screen.getByText("ほか 2件")).toBeTruthy();
  });

  it("タイトルは本文の1行目だけを出す", async () => {
    await db.notes.add({ ...base, id: "a", body: "買い物リスト\n牛乳\n卵", remindAt: Date.now() + 3600_000 });
    render(<ReminderFolderCard onOpen={() => {}} />);
    await screen.findByText("買い物リスト");
    expect(screen.queryByText(/牛乳/)).toBeNull();
  });

  it("リマインダーが無ければカード自体を描画しない", async () => {
    render(<ReminderFolderCard onOpen={() => {}} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(document.querySelector(".reminder-folder")).toBeNull();
  });
});
