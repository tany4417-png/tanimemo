// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  finishBootProfile,
  formatBootProfile,
  loadBootProfile,
  markBoot,
  measureBoot,
  startBootProfile,
  type BootProfile,
} from "./boot-profile";

// 差し替え用の時計。呼ばれるたびに進める
function fakeClock(steps: number[]): () => number {
  let i = 0;
  return () => steps[Math.min(i++, steps.length - 1)];
}

beforeEach(() => {
  localStorage.clear();
});

describe("markBoot", () => {
  it("起動開始からの経過msを名前つきで記録する", () => {
    startBootProfile(fakeClock([0, 120, 480]));
    markBoot("Appマウント");
    markBoot("一覧の初回読み出し");
    const p = finishBootProfile({ notes: 467, bodyChars: 742000 }, 1000);
    expect(p.marks).toEqual([
      { name: "Appマウント", ms: 120 },
      { name: "一覧の初回読み出し", ms: 480 },
    ]);
  });

  it("同じ名前は最初の1回だけ残す（StrictModeの二重実行で重複させない）", () => {
    startBootProfile(fakeClock([0, 100, 900]));
    markBoot("Appマウント");
    markBoot("Appマウント");
    const p = finishBootProfile({ notes: 0, bodyChars: 0 }, 1000);
    expect(p.marks).toEqual([{ name: "Appマウント", ms: 100 }]);
  });
});

describe("measureBoot", () => {
  it("処理の所要msを記録し、戻り値はそのまま返す", async () => {
    startBootProfile(fakeClock([0, 10, 220]));
    const got = await measureBoot("空メモ掃除", async () => "done");
    expect(got).toBe("done");
    const p = finishBootProfile({ notes: 0, bodyChars: 0 }, 1000);
    expect(p.spans).toEqual([{ name: "空メモ掃除", ms: 210 }]);
  });

  it("処理が失敗しても所要を残したうえで例外を投げ直す", async () => {
    startBootProfile(fakeClock([0, 10, 60]));
    await expect(measureBoot("孤児チェック", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    const p = finishBootProfile({ notes: 0, bodyChars: 0 }, 1000);
    expect(p.spans).toEqual([{ name: "孤児チェック", ms: 50 }]);
  });
});

describe("finishBootProfile / loadBootProfile", () => {
  it("保存した内容を次の起動で読み戻せる", () => {
    startBootProfile(fakeClock([0, 300]));
    markBoot("初回同期");
    const saved = finishBootProfile({ notes: 467, bodyChars: 742000 }, 1755600000000);
    expect(loadBootProfile()).toEqual(saved);
    expect(saved.at).toBe(1755600000000);
    expect(saved.counts).toEqual({ notes: 467, bodyChars: 742000 });
  });

  it("記録が無ければnullを返す", () => {
    expect(loadBootProfile()).toBeNull();
  });

  it("壊れた記録はnullとして扱う（読み出しで落とさない）", () => {
    localStorage.setItem("tanimemo.bootProfile", "{壊れたJSON");
    expect(loadBootProfile()).toBeNull();
  });
});

describe("formatBootProfile", () => {
  it("件数・経過・内訳を読める形に並べる", () => {
    const p: BootProfile = {
      at: 1755600000000,
      marks: [{ name: "Appマウント", ms: 120 }, { name: "初回同期", ms: 1520 }],
      spans: [{ name: "空メモ掃除", ms: 210 }],
      counts: { notes: 467, bodyChars: 742000 },
    };
    const text = formatBootProfile(p);
    expect(text).toContain("メモ467件");
    expect(text).toContain("本文742,000字");
    expect(text).toContain("Appマウント: 120ms");
    expect(text).toContain("初回同期: 1520ms");
    expect(text).toContain("空メモ掃除: 210ms");
  });
});
