// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { db, resetDbForTests } from "../lib/db";
import { RemindersScreen } from "./RemindersScreen";

const base = { importance: 0 as const, createdAt: 1, updatedAt: 1, deleted: 0 as const,
  dirty: 0 as const, folderId: null, orderKey: null, repeatRule: null };

describe("RemindersScreen", () => {
  beforeEach(async () => { await resetDbForTests(); });
  it("未来のリマインダーが時刻順に並ぶ", async () => {
    const now = Date.now();
    await db.notes.bulkAdd([
      { ...base, id: "a", body: "後のメモ", remindAt: now + 7200_000 },
      { ...base, id: "b", body: "先のメモ", remindAt: now + 3600_000 },
    ]);
    render(<RemindersScreen onOpenNote={() => {}} onBack={() => {}} />);
    const items = await screen.findAllByRole("listitem");
    expect(items[0].textContent).toContain("先のメモ");
    expect(items[1].textContent).toContain("後のメモ");
  });
  it("発火済みの過去単発は末尾にfiredクラスで出る", async () => {
    const now = Date.now();
    await db.notes.bulkAdd([
      { ...base, id: "a", body: "未来", remindAt: now + 3600_000 },
      { ...base, id: "b", body: "過去", remindAt: now - 3 * 86400_000 },
    ]);
    render(<RemindersScreen onOpenNote={() => {}} onBack={() => {}} />);
    const items = await screen.findAllByRole("listitem");
    expect(items[1].textContent).toContain("過去");
    expect(items[1].className).toContain("fired");
  });
  it("削除済みメモは出ない", async () => {
    await db.notes.add({ ...base, id: "a", body: "ゴミ", deleted: 1, remindAt: Date.now() + 3600_000 });
    render(<RemindersScreen onOpenNote={() => {}} onBack={() => {}} />);
    expect(screen.queryByText(/ゴミ/)).toBeNull();
  });
});
