import { describe, it, expect } from "vitest";
import { deriveReminderInfo, reminderLabel } from "./reminder-label";

describe("reminderLabel", () => {
  const now = new Date(2026, 6, 22, 12, 0).getTime(); // 2026-07-22 12:00（ローカル）

  it("remindAtがnullなら「なし」でnull", () => {
    expect(reminderLabel(null, null, now)).toBeNull();
  });

  it("発火済み（24時間より前）の単発は「済」", () => {
    const past = now - 25 * 3600_000;
    expect(reminderLabel(past, null, now)).toBe("済");
  });

  it("未来の単発は「M/D HH:MM」形式", () => {
    const future = new Date(2026, 7, 1, 9, 0).getTime(); // 2026-08-01 09:00
    expect(reminderLabel(future, null, now)).toBe("8/1 09:00");
  });

  it("繰り返し設定は「・毎週」等のラベルが付く", () => {
    const base = new Date(2026, 6, 22, 9, 0).getTime(); // 2026-07-22（水）09:00
    const rule = JSON.stringify({ type: "weekly", weekdays: [3] });
    const label = reminderLabel(base, rule, now);
    expect(label).not.toBeNull();
    expect(label).toContain("・毎週");
  });
});

// reminderLabelはこのfired/nextを使わずlabelだけ取り出す薄いラッパー。
// RemindersScreenの並び替え（fired優先→next昇順）はこちらの構造化フィールドを直接使う
describe("deriveReminderInfo", () => {
  const now = new Date(2026, 6, 22, 12, 0).getTime();

  it("remindAtがnullならfired=false・next=null・label=nullを返す", () => {
    expect(deriveReminderInfo(null, null, now)).toEqual({ fired: false, next: null, label: null });
  });

  it("発火済み（24時間より前）の単発はfired=true・next=null・label「済」", () => {
    const past = now - 25 * 3600_000;
    expect(deriveReminderInfo(past, null, now)).toEqual({ fired: true, next: null, label: "済" });
  });

  it("未来の単発はfired=false・next=remindAt自身", () => {
    const future = new Date(2026, 7, 1, 9, 0).getTime();
    const info = deriveReminderInfo(future, null, now);
    expect(info.fired).toBe(false);
    expect(info.next).toBe(future);
    expect(info.label).toBe("8/1 09:00");
  });
});
