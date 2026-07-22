// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { db, resetDbForTests } from "../lib/db";
import { RemindersScreen } from "./RemindersScreen";

const base = { importance: 0 as const, createdAt: 1, updatedAt: 1, deleted: 0 as const,
  dirty: 0 as const, folderId: null, orderKey: null, repeatRule: null };

// 他画面（TrashScreen等）と同様、syncBar/slideClassはApp.tsxが一度だけ組み立てて渡すが、
// 単体テストでは中身を問わないのでnull/空文字で十分
const screenProps = { syncBar: null, slideClass: "" };

describe("RemindersScreen", () => {
  beforeEach(async () => { await resetDbForTests(); });
  it("未来のリマインダーが時刻順に並ぶ", async () => {
    const now = Date.now();
    await db.notes.bulkAdd([
      { ...base, id: "a", body: "後のメモ", remindAt: now + 7200_000 },
      { ...base, id: "b", body: "先のメモ", remindAt: now + 3600_000 },
    ]);
    render(<RemindersScreen {...screenProps} onOpenNote={() => {}} onBack={() => {}} />);
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
    render(<RemindersScreen {...screenProps} onOpenNote={() => {}} onBack={() => {}} />);
    const items = await screen.findAllByRole("listitem");
    expect(items[1].textContent).toContain("過去");
    expect(items[1].className).toContain("fired");
  });
  it("削除済みメモは出ない", async () => {
    await db.notes.add({ ...base, id: "a", body: "ゴミ", deleted: 1, remindAt: Date.now() + 3600_000 });
    render(<RemindersScreen {...screenProps} onOpenNote={() => {}} onBack={() => {}} />);
    expect(screen.queryByText(/ゴミ/)).toBeNull();
  });
  it("行をクリックするとonOpenNoteが該当idで呼ばれる", async () => {
    const now = Date.now();
    await db.notes.add({ ...base, id: "a", body: "タップ対象", remindAt: now + 3600_000 });
    const onOpenNote = vi.fn();
    render(<RemindersScreen {...screenProps} onOpenNote={onOpenNote} onBack={() => {}} />);
    const item = await screen.findByRole("listitem");
    item.click();
    expect(onOpenNote).toHaveBeenCalledWith("a");
  });
});
