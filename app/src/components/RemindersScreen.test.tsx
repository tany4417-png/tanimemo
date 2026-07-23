// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { db, resetDbForTests } from "../lib/db";
import { RemindersScreen } from "./RemindersScreen";

const base = { importance: 0 as const, createdAt: 1, updatedAt: 1, deleted: 0 as const,
  dirty: 0 as const, folderId: null, orderKey: null, repeatRule: null };

// 他画面（TrashScreen等）と同様、syncBar/slideClassはApp.tsxが一度だけ組み立てて渡すが、
// 単体テストでは中身を問わないのでnull/空文字で十分
const screenProps = { syncBar: null, slideClass: "", onCreate: () => {}, onDelete: () => {} };

// 行はSwipeableCard（.card.reminder-row）になったため、role=listitemではなくクラスで拾う
const rowEls = () => Array.from(document.querySelectorAll<HTMLElement>(".reminder-row"));

describe("RemindersScreen", () => {
  beforeEach(async () => { await resetDbForTests(); });
  it("未来のリマインダーが時刻順に並ぶ", async () => {
    const now = Date.now();
    await db.notes.bulkAdd([
      { ...base, id: "a", body: "後のメモ", remindAt: now + 7200_000 },
      { ...base, id: "b", body: "先のメモ", remindAt: now + 3600_000 },
    ]);
    render(<RemindersScreen {...screenProps} onOpenNote={() => {}} onBack={() => {}} />);
    await screen.findByText("先のメモ");
    const items = rowEls();
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
    await screen.findByText("過去");
    const items = rowEls();
    expect(items[1].textContent).toContain("過去");
    expect(items[1].className).toContain("fired");
  });
  it("削除済みメモは出ない", async () => {
    await db.notes.add({ ...base, id: "a", body: "ゴミ", deleted: 1, remindAt: Date.now() + 3600_000 });
    render(<RemindersScreen {...screenProps} onOpenNote={() => {}} onBack={() => {}} />);
    expect(screen.queryByText(/ゴミ/)).toBeNull();
  });
  it("新規ボタンでonCreateが呼ばれる", async () => {
    const onCreate = vi.fn();
    render(<RemindersScreen {...screenProps} onCreate={onCreate} onOpenNote={() => {}} onBack={() => {}} />);
    screen.getByRole("button", { name: "新規" }).click();
    expect(onCreate).toHaveBeenCalled();
  });
  it("行をタップするとonOpenNoteが該当idで呼ばれる", async () => {
    const now = Date.now();
    await db.notes.add({ ...base, id: "a", body: "タップ対象", remindAt: now + 3600_000 });
    const onOpenNote = vi.fn();
    render(<RemindersScreen {...screenProps} onOpenNote={onOpenNote} onBack={() => {}} />);
    await screen.findByText("タップ対象");
    // SwipeableCardのタップ判定はpointerdown→(移動なし)→pointerupで成立する
    const item = rowEls()[0];
    fireEvent.pointerDown(item);
    fireEvent.pointerUp(item);
    expect(onOpenNote).toHaveBeenCalledWith("a");
  });
  it("行の削除ボタンでonDeleteが該当idで呼ばれる", async () => {
    const now = Date.now();
    await db.notes.add({ ...base, id: "a", body: "削除対象", remindAt: now + 3600_000 });
    const onDelete = vi.fn();
    render(<RemindersScreen {...screenProps} onDelete={onDelete} onOpenNote={() => {}} onBack={() => {}} />);
    await screen.findByText("削除対象");
    screen.getByRole("button", { name: "削除" }).click();
    expect(onDelete).toHaveBeenCalledWith("a");
  });
  it("本文が空のメモ（画像のみ等）は仮タイトル「メモ」を出さない", async () => {
    const now = Date.now();
    await db.notes.add({ ...base, id: "a", body: "", remindAt: now + 3600_000 });
    render(<RemindersScreen {...screenProps} onOpenNote={() => {}} onBack={() => {}} />);
    // 行自体は出る（時刻ラベルで待つ）が、タイトル部は空のまま
    await vi.waitFor(() => expect(rowEls().length).toBe(1));
    expect(screen.queryByText("メモ")).toBeNull();
  });
  it("未読のメモの行に赤点が付く", async () => {
    const now = Date.now();
    await db.notes.bulkAdd([
      { ...base, id: "a", body: "未読あり", remindAt: now + 3600_000 },
      { ...base, id: "b", body: "未読なし", remindAt: now + 7200_000 },
    ]);
    await db.unread.add({ noteId: "a", firedAt: now });
    render(<RemindersScreen {...screenProps} onOpenNote={() => {}} onBack={() => {}} />);
    await screen.findByText("未読あり");
    const items = rowEls();
    expect(items[0].querySelector(".unread-dot")).not.toBeNull();
    expect(items[1].querySelector(".unread-dot")).toBeNull();
  });
});
