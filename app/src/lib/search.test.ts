import { describe, expect, it } from "vitest";
import { makeSnippet } from "./search";

describe("makeSnippet", () => {
  it("マッチ前後の文脈を構造化して返す", () => {
    expect(makeSnippet("今日は畑でナスの苗を植えた", "ナス")).toEqual({
      before: "今日は畑で",
      match: "ナス",
      after: "の苗を植えた",
    });
  });

  it("前後が長いときは既定20文字で切り「…」を付ける", () => {
    const body = "あ".repeat(30) + "ナス" + "い".repeat(30);
    const s = makeSnippet(body, "ナス")!;
    expect(s.before).toBe("…" + "あ".repeat(20));
    expect(s.after).toBe("い".repeat(20) + "…");
  });

  it("大文字小文字を無視してマッチし、matchは本文の元表記を返す", () => {
    const s = makeSnippet("Use React now", "react")!;
    expect(s.match).toBe("React");
  });

  it("改行・連続空白は空白1つに寄せる（スニペットは1行表示のため）", () => {
    const s = makeSnippet("一行目\n二行目に  ナスがある", "ナス")!;
    expect(s.before).toBe("一行目 二行目に ");
    expect(s.after).toBe("がある");
  });

  it("最初のマッチだけを対象にする", () => {
    const s = makeSnippet("ナスとナス", "ナス")!;
    expect(s.before).toBe("");
    expect(s.after).toBe("とナス");
  });

  it("マッチ無し・空クエリ・空白クエリはnull", () => {
    expect(makeSnippet("本文", "無い")).toBeNull();
    expect(makeSnippet("本文", "")).toBeNull();
    expect(makeSnippet("本文", "   ")).toBeNull();
  });
});
