// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { jstDayStart } from "../../../shared/repeat";
import { db, resetDbForTests } from "../lib/db";
import { CalendarView } from "./CalendarView";

const base = {
  importance: 0 as const, createdAt: 1, updatedAt: 1, deleted: 0 as const,
  dirty: 0 as const, folderId: null, orderKey: null, repeatRule: null,
};

const cells = () => Array.from(document.querySelectorAll<HTMLElement>(".cal-cell"));

describe("CalendarView", () => {
  beforeEach(async () => { await resetDbForTests(); });

  it("42マス描画する", async () => {
    render(<CalendarView onOpenNote={() => {}} onCreateAt={() => {}} />);
    await vi.waitFor(() => expect(cells()).toHaveLength(42));
  });

  it("予定のあるマスに帯が出る", async () => {
    const now = Date.now();
    await db.notes.add({ ...base, id: "A", body: "訪問", remindAt: now + 2 * 86400_000 });
    render(<CalendarView onOpenNote={() => {}} onCreateAt={() => {}} />);
    await screen.findAllByText("訪問");
  });

  it("3件以上ある日は2件＋残数表示になる", async () => {
    const day = jstDayStart(new Date().getFullYear(), new Date().getMonth(), 15);
    await db.notes.bulkAdd([
      { ...base, id: "A", body: "1件目", remindAt: day + 9 * 3600_000 },
      { ...base, id: "B", body: "2件目", remindAt: day + 10 * 3600_000 },
      { ...base, id: "C", body: "3件目", remindAt: day + 11 * 3600_000 },
    ]);
    render(<CalendarView onOpenNote={() => {}} onCreateAt={() => {}} />);
    await screen.findByText("＋1");
  });

  it("日をタップすると下の一覧がその日になる", async () => {
    const day = jstDayStart(new Date().getFullYear(), new Date().getMonth(), 15);
    await db.notes.add({ ...base, id: "A", body: "選択日のメモ", remindAt: day + 9 * 3600_000 });
    render(<CalendarView onOpenNote={() => {}} onCreateAt={() => {}} />);
    // useLiveQueryの初期値は空配列なので、グリッドに帯が出る（＝notesを読み終えた）のを待ってからセルを探す
    await screen.findAllByText("選択日のメモ");
    const target = await vi.waitFor(() => {
      const c = cells().find((el) => el.getAttribute("data-day-start") === String(day));
      if (!c) throw new Error("cell not found");
      return c;
    });
    fireEvent.click(target);
    expect(document.querySelector(".cal-daylist")?.textContent).toContain("選択日のメモ");
  });

  it("一覧の行をタップするとonOpenNoteが呼ばれる", async () => {
    const day = jstDayStart(new Date().getFullYear(), new Date().getMonth(), 15);
    await db.notes.add({ ...base, id: "A", body: "開く対象", remindAt: day + 9 * 3600_000 });
    const onOpenNote = vi.fn();
    render(<CalendarView onOpenNote={onOpenNote} onCreateAt={() => {}} />);
    // 同上: notesの読み込みを待ってからセルを探す（先に待たないと帯が空のまま押してしまう）
    await screen.findAllByText("開く対象");
    const target = await vi.waitFor(() => {
      const c = cells().find((el) => el.getAttribute("data-day-start") === String(day));
      if (!c) throw new Error("cell not found");
      return c;
    });
    fireEvent.click(target);
    screen.getByRole("button", { name: /開く対象/ }).click();
    expect(onOpenNote).toHaveBeenCalledWith("A");
  });

  it("過去の日には作成ボタンを出さない", async () => {
    render(<CalendarView onOpenNote={() => {}} onCreateAt={() => {}} />);
    await vi.waitFor(() => expect(cells()).toHaveLength(42));
    // 今日の月では出ている
    expect(screen.getByRole("button", { name: /この日に通知付きメモを作る/ })).toBeTruthy();
    // 前の月へ移すと選択日は前月1日＝必ず過去になり、ボタンが消える
    // (state更新後の再描画を同期的に読むため、素の.click()ではなくact()でラップされるfireEvent.clickを使う)
    fireEvent.click(screen.getByRole("button", { name: "前の月" }));
    expect(screen.queryByRole("button", { name: /この日に通知付きメモを作る/ })).toBeNull();
  });

  it("今日から作成ボタンを押すと9:00のepoch msが渡る", async () => {
    const onCreateAt = vi.fn();
    render(<CalendarView onOpenNote={() => {}} onCreateAt={onCreateAt} />);
    await vi.waitFor(() => expect(cells()).toHaveLength(42));
    screen.getByRole("button", { name: /この日に通知付きメモを作る/ }).click();
    const arg = onCreateAt.mock.calls[0][0] as number;
    // JSTの9時ちょうど（UTCでは0時）
    expect(new Date(arg + 9 * 3600_000).getUTCHours()).toBe(9);
  });
});
