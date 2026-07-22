import { describe, it, expect } from "vitest";
import { nextFireAt, deriveNextFire, parseRepeatRule, DAY_MS } from "../../../shared/repeat";

// JSTの日時を作るテストヘルパ（+9h固定）
const jst = (y: number, mo: number, d: number, hh = 9, mm = 0) =>
  Date.UTC(y, mo - 1, d, hh, mm) - 9 * 3600_000;

describe("nextFireAt", () => {
  it("daily: 翌日の同時刻", () => {
    const base = jst(2026, 7, 22, 8, 0);
    expect(nextFireAt(base, { type: "daily" }, jst(2026, 7, 22, 10, 0))).toBe(jst(2026, 7, 23, 8, 0));
  });
  it("daily: afterが基準より前なら基準そのもの", () => {
    const base = jst(2026, 7, 22, 8, 0);
    expect(nextFireAt(base, { type: "daily" }, jst(2026, 7, 20, 0, 0))).toBe(base);
  });
  it("weekly: 曜日複数（水=3・土=6）で次の該当日", () => {
    const base = jst(2026, 7, 22, 7, 30); // 2026-07-22はJSTで水曜
    // afterが水曜の発火後 → 次は土曜
    expect(nextFireAt(base, { type: "weekly", weekdays: [3, 6] }, jst(2026, 7, 22, 8, 0)))
      .toBe(jst(2026, 7, 25, 7, 30));
  });
  it("monthly: 31日指定は存在しない月をスキップ", () => {
    const base = jst(2026, 1, 31, 9, 0);
    // 2月に31日はない → 3月31日
    expect(nextFireAt(base, { type: "monthly", day: 31 }, jst(2026, 2, 1, 0, 0)))
      .toBe(jst(2026, 3, 31, 9, 0));
  });
  it("interval week: 隔週は基準起点の等差数列（位相がドリフトしない）", () => {
    const base = jst(2026, 7, 1, 9, 0);
    // 3週間+1日後 → 次は基準+4週
    expect(nextFireAt(base, { type: "interval", unit: "week", n: 2 }, jst(2026, 7, 23, 0, 0)))
      .toBe(jst(2026, 7, 29, 9, 0));
  });
  it("interval day: 3日ごと", () => {
    const base = jst(2026, 7, 6, 9, 0);
    // 基準+7日後のafterから、基準+9日を返す
    expect(nextFireAt(base, { type: "interval", unit: "day", n: 3 }, jst(2026, 7, 13, 0, 0)))
      .toBe(jst(2026, 7, 15, 9, 0));
  });
  it("nth_weekday: 第2火曜", () => {
    const base = jst(2026, 7, 14, 9, 0); // 2026-07-14は第2火曜
    expect(nextFireAt(base, { type: "nth_weekday", nth: 2, weekday: 2 }, jst(2026, 7, 14, 10, 0)))
      .toBe(jst(2026, 8, 11, 9, 0)); // 8月の第2火曜
  });
  it("nth_weekday: 第1月曜", () => {
    const base = jst(2026, 7, 6, 9, 0); // 2026-07-06はJSTで第1月曜
    expect(nextFireAt(base, { type: "nth_weekday", nth: 1, weekday: 1 }, jst(2026, 7, 6, 10, 0)))
      .toBe(jst(2026, 8, 3, 9, 0)); // 8月の第1月曜
  });
  it("nth_weekday: nth=-1は最終曜日", () => {
    const base = jst(2026, 7, 31, 9, 0); // 2026-07-31はJSTで金曜（最終金曜）
    expect(nextFireAt(base, { type: "nth_weekday", nth: -1, weekday: 5 }, jst(2026, 7, 31, 10, 0)))
      .toBe(jst(2026, 8, 28, 9, 0)); // 8月の最終金曜
  });
  it("うるう年: 毎月29日は平年2月をスキップ", () => {
    const base = jst(2027, 1, 29, 9, 0); // 2027は平年
    expect(nextFireAt(base, { type: "monthly", day: 29 }, jst(2027, 2, 1, 0, 0)))
      .toBe(jst(2027, 3, 29, 9, 0));
  });
  it("過去分が複数周期溜まっても、返るのはnowより後の最初の1つ（1回に正規化）", () => {
    const base = jst(2026, 7, 1, 9, 0);
    expect(nextFireAt(base, { type: "daily" }, jst(2026, 7, 22, 0, 0))).toBe(jst(2026, 7, 22, 9, 0));
  });
});

describe("deriveNextFire", () => {
  const now = jst(2026, 7, 22, 12, 0);
  it("単発・未来: remindAtそのまま", () => {
    expect(deriveNextFire(jst(2026, 7, 23, 9, 0), null, now)).toBe(jst(2026, 7, 23, 9, 0));
  });
  it("単発・過去24時間以内: remindAtを返す（発火対象）", () => {
    expect(deriveNextFire(now - DAY_MS + 60_000, null, now)).toBe(now - DAY_MS + 60_000);
  });
  it("単発・24時間ちょうど: remindAtを返す（24時間以内に含む）", () => {
    expect(deriveNextFire(now - DAY_MS, null, now)).toBe(now - DAY_MS);
  });
  it("単発・24時間より古い: null（発火済み扱い）", () => {
    expect(deriveNextFire(now - DAY_MS - 60_000, null, now)).toBeNull();
  });
  it("繰り返し: nextFireAtへ委譲される", () => {
    expect(deriveNextFire(jst(2026, 7, 1, 9, 0), { type: "daily" }, now)).toBe(jst(2026, 7, 23, 9, 0));
  });
});

describe("parseRepeatRule", () => {
  it("nullはnull", () => expect(parseRepeatRule(null)).toBeNull());
  it("正常JSON: daily", () => expect(parseRepeatRule('{"type":"daily"}')).toEqual({ type: "daily" }));
  it("正常JSON: weekly", () => expect(parseRepeatRule('{"type":"weekly","weekdays":[1,3,5]}')).toEqual({ type: "weekly", weekdays: [1, 3, 5] }));
  it("正常JSON: monthly", () => expect(parseRepeatRule('{"type":"monthly","day":15}')).toEqual({ type: "monthly", day: 15 }));
  it("正常JSON: interval", () => expect(parseRepeatRule('{"type":"interval","unit":"day","n":3}')).toEqual({ type: "interval", unit: "day", n: 3 }));
  it("正常JSON: nth_weekday", () => expect(parseRepeatRule('{"type":"nth_weekday","nth":2,"weekday":1}')).toEqual({ type: "nth_weekday", nth: 2, weekday: 1 }));
  it("壊れたJSONはnull（例外にしない）", () => expect(parseRepeatRule("{oops")).toBeNull());
  it("weekdays欠落: null", () => expect(parseRepeatRule('{"type":"weekly"}')).toBeNull());
  it("weekdays空配列: null", () => expect(parseRepeatRule('{"type":"weekly","weekdays":[]}')).toBeNull());
  it("weekdaysに無効値（7以上）: null", () => expect(parseRepeatRule('{"type":"weekly","weekdays":[1,7]}')).toBeNull());
  it("monthのday=0: null", () => expect(parseRepeatRule('{"type":"monthly","day":0}')).toBeNull());
  it("monthのday=32: null", () => expect(parseRepeatRule('{"type":"monthly","day":32}')).toBeNull());
  it("intervalのunit=hour: null", () => expect(parseRepeatRule('{"type":"interval","unit":"hour","n":2}')).toBeNull());
  it("intervalのn=0: null", () => expect(parseRepeatRule('{"type":"interval","unit":"day","n":0}')).toBeNull());
  it("nth_weekdayのnth=0: null", () => expect(parseRepeatRule('{"type":"nth_weekday","nth":0,"weekday":1}')).toBeNull());
  it("nth_weekdayのweekday=7: null", () => expect(parseRepeatRule('{"type":"nth_weekday","nth":1,"weekday":7}')).toBeNull());
  it("未知のtype: null", () => expect(parseRepeatRule('{"type":"unknown"}')).toBeNull());
});
