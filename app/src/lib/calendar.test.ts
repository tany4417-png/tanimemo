import { describe, it, expect } from "vitest";
import { jstDayStart } from "../../../shared/repeat";
import { buildMonthCells, monthRange } from "./calendar";
import { accentClassFor } from "./colors";

const note = (over: Partial<Parameters<typeof buildMonthCells>[2][number]> = {}) => ({
  id: "N1", body: "高橋工務店 訪問\n2行目", folderId: null, remindAt: null, repeatRule: null, ...over,
});

describe("monthRange", () => {
  it("表示月の1日を含む週の日曜から42日ぶん", () => {
    // 2026-08-01 は土曜。その週の日曜は 2026-07-26
    const { from, to } = monthRange(2026, 7);
    expect(from).toBe(jstDayStart(2026, 6, 26));
    expect(to).toBe(from + 42 * 86400_000 - 1);
  });
});

describe("buildMonthCells", () => {
  const now = jstDayStart(2026, 7, 11);

  it("42マス返る", () => {
    expect(buildMonthCells(2026, 7, [], new Map(), now)).toHaveLength(42);
  });

  it("表示月かどうかがinMonthに入る", () => {
    const cells = buildMonthCells(2026, 7, [], new Map(), now);
    expect(cells[0].inMonth).toBe(false); // 7/26
    expect(cells[6].inMonth).toBe(true); // 8/1
  });

  it("単発リマインダーが該当日のマスに入る", () => {
    const at = jstDayStart(2026, 7, 12) + 9 * 3600_000;
    const cells = buildMonthCells(2026, 7, [note({ remindAt: at })], new Map(), now);
    const cell = cells.find((c) => c.day === 12 && c.inMonth)!;
    expect(cell.items).toHaveLength(1);
    expect(cell.items[0].title).toBe("高橋工務店 訪問");
    expect(cell.items[0].at).toBe(at);
  });

  it("繰り返しは複数のマスに展開される", () => {
    const at = jstDayStart(2026, 7, 3) + 7 * 3600_000;
    const cells = buildMonthCells(
      2026, 7,
      [note({ remindAt: at, repeatRule: JSON.stringify({ type: "weekly", weekdays: [1] }) })],
      new Map(), now
    );
    expect(cells.filter((c) => c.items.length > 0).length).toBeGreaterThan(3);
  });

  it("同じ日の予定は時刻順に並ぶ", () => {
    const day = jstDayStart(2026, 7, 12);
    const cells = buildMonthCells(
      2026, 7,
      [note({ id: "A", body: "夕方", remindAt: day + 17 * 3600_000 }),
       note({ id: "B", body: "朝", remindAt: day + 9 * 3600_000 })],
      new Map(), now
    );
    const cell = cells.find((c) => c.day === 12 && c.inMonth)!;
    expect(cell.items.map((i) => i.title)).toEqual(["朝", "夕方"]);
  });

  it("過ぎた予定にはfiredが立つ", () => {
    const past = jstDayStart(2026, 7, 5) + 9 * 3600_000;
    const cells = buildMonthCells(2026, 7, [note({ remindAt: past })], new Map(), now);
    const cell = cells.find((c) => c.day === 5 && c.inMonth)!;
    expect(cell.items[0].fired).toBe(true);
  });

  it("フォルダ名からアクセントクラスが決まる。フォルダ無しは藍", () => {
    const at = jstDayStart(2026, 7, 12) + 9 * 3600_000;
    const cells = buildMonthCells(
      2026, 7,
      [note({ remindAt: at, folderId: "F1" })],
      new Map([["F1", "仕事"]]), now
    );
    const cell = cells.find((c) => c.day === 12 && c.inMonth)!;
    // 「仕事」は文字コード合計40288、40288 % 8 = 0 → ACCENT_CLASSES[0] = red
    expect(cell.items[0].accentClass).toBe("acc-red");
    // 既存のaccentClassForと同じ答えになることも確かめる（彩色規則をここで二重定義しない）
    expect(cell.items[0].accentClass).toBe(accentClassFor("仕事"));
    const noFolder = buildMonthCells(2026, 7, [note({ remindAt: at })], new Map(), now);
    expect(noFolder.find((c) => c.day === 12 && c.inMonth)!.items[0].accentClass).toBe("acc-indigo");
  });

  it("remindAtがnullのメモは無視する", () => {
    const cells = buildMonthCells(2026, 7, [note({ remindAt: null })], new Map(), now);
    expect(cells.every((c) => c.items.length === 0)).toBe(true);
  });
});
