// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  finishBootProfile,
  formatBootProfile,
  loadBootProfile,
  markBoot,
  measureBoot,
  formatBootProfiles,
  loadBootProfiles,
  startBootProfile,
  summarizeNavigation,
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
    localStorage.setItem("tanimemo.bootProfiles", "{壊れたJSON");
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

describe("summarizeNavigation", () => {
  const nav = { workerStart: 118.4, responseEnd: 210.2, domContentLoadedEventEnd: 301.6 };
  const script = { duration: 480.7, transferSize: 0, encodedBodySize: 327680 };

  it("ナビゲーション基準の各時点とメインJSの取得を丸めて返す", () => {
    const got = summarizeNavigation(nav, script, 950.3, true);
    expect(got).toEqual({
      workerStart: 118,
      responseEnd: 210,
      domContentLoaded: 302,
      jsStart: 950,
      scriptMs: 481,
      scriptKB: 320,
      controlled: true,
    });
  });

  it("SWキャッシュから返るとtransferSizeが0になるので実体サイズを使う", () => {
    const got = summarizeNavigation(nav, { duration: 10, transferSize: 0, encodedBodySize: 102400 }, 100, true);
    expect(got?.scriptKB).toBe(100);
  });

  it("ネットワークから取得したときは転送サイズを使う", () => {
    const got = summarizeNavigation(nav, { duration: 10, transferSize: 51200, encodedBodySize: 102400 }, 100, false);
    expect(got?.scriptKB).toBe(50);
  });

  it("navigation情報が取れない環境ではnullを返す", () => {
    expect(summarizeNavigation(undefined, script, 100, true)).toBeNull();
  });

  it("メインJSのresource情報が無くても他の値は返す", () => {
    const got = summarizeNavigation(nav, undefined, 950, true);
    expect(got?.scriptMs).toBe(0);
    expect(got?.scriptKB).toBe(0);
    expect(got?.jsStart).toBe(950);
  });
});

describe("formatBootProfile（ナビゲーション込み）", () => {
  it("画面が出るまでの内訳を1行で出す", () => {
    const p: BootProfile = {
      at: 1755600000000,
      marks: [{ name: "Appマウント", ms: 12 }],
      spans: [],
      counts: { notes: 436, bodyChars: 2170583 },
      nav: { workerStart: 118, responseEnd: 210, domContentLoaded: 302, jsStart: 950, scriptMs: 481, scriptKB: 320, controlled: true },
    };
    const text = formatBootProfile(p);
    expect(text).toContain("SW起動: 118ms");
    expect(text).toContain("HTML: 210ms");
    expect(text).toContain("JS開始: 950ms");
    expect(text).toContain("メインJS: 481ms・320KB");
    expect(text).toContain("SW制御: あり");
  });

  it("ナビゲーション情報が無ければその行は出さない", () => {
    const p: BootProfile = {
      at: 1755600000000,
      marks: [{ name: "Appマウント", ms: 12 }],
      spans: [],
      counts: { notes: 1, bodyChars: 1 },
      nav: null,
    };
    expect(formatBootProfile(p)).not.toContain("SW起動");
  });
});

describe("起動プロファイルの履歴", () => {
  it("新しい順に積む（最新が先頭）", () => {
    startBootProfile(fakeClock([0, 10]));
    finishBootProfile({ notes: 1, bodyChars: 1 }, 1000);
    startBootProfile(fakeClock([0, 20]));
    finishBootProfile({ notes: 2, bodyChars: 2 }, 2000);
    expect(loadBootProfiles().map((p) => p.at)).toEqual([2000, 1000]);
  });

  it("10件を超えたら古いものから捨てる", () => {
    for (let i = 1; i <= 12; i++) {
      startBootProfile(fakeClock([0, i]));
      finishBootProfile({ notes: i, bodyChars: 0 }, i * 1000);
    }
    const list = loadBootProfiles();
    expect(list).toHaveLength(10);
    expect(list[0].at).toBe(12000);
    expect(list[9].at).toBe(3000);
  });

  it("loadBootProfileは履歴の最新1件を返す", () => {
    startBootProfile(fakeClock([0, 10]));
    finishBootProfile({ notes: 1, bodyChars: 1 }, 1000);
    startBootProfile(fakeClock([0, 20]));
    const latest = finishBootProfile({ notes: 2, bodyChars: 2 }, 2000);
    expect(loadBootProfile()).toEqual(latest);
  });

  it("履歴が壊れていても空として扱う", () => {
    localStorage.setItem("tanimemo.bootProfiles", "{壊れ");
    expect(loadBootProfiles()).toEqual([]);
    expect(loadBootProfile()).toBeNull();
  });
});

describe("formatBootProfiles", () => {
  function sample(at: number, sync: number): BootProfile {
    return {
      at,
      marks: [{ name: "一覧の初回読み出し", ms: 36 }, { name: "初回同期", ms: sync }],
      spans: [],
      counts: { notes: 435, bodyChars: 2165833 },
      nav: { workerStart: 2, responseEnd: 14, domContentLoaded: 64, jsStart: 63, scriptMs: 16, scriptKB: 0, controlled: true },
    };
  }

  it("最新は詳細、過去は1行ずつ並べる", () => {
    const text = formatBootProfiles([sample(2000, 328), sample(1000, 2400)]);
    expect(text).toContain("SW起動: 2ms");
    expect(text).toContain("過去の起動");
    // 過去の行は1行サマリ。遅かった回を見分けられるよう主要な3つを出す
    expect(text).toMatch(/JS開始: 63ms \/ 一覧: 36ms \/ 同期: 2400ms/);
  });

  it("1件しかなければ過去の行は出さない", () => {
    expect(formatBootProfiles([sample(2000, 328)])).not.toContain("過去の起動");
  });

  it("記録が無ければその旨を返す", () => {
    expect(formatBootProfiles([])).toBe("前回の起動: 記録なし");
  });
});
