import { describe, expect, it } from "vitest";
import { ACCENT_CLASSES, accentClassFor, colorIndexFor } from "./colors";

describe("colorIndexFor", () => {
  it("0〜7の範囲に収まる", () => {
    const idx = colorIndexFor("なんでもいい名前");
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThanOrEqual(7);
  });

  it("空文字は0", () => {
    expect(colorIndexFor("")).toBe(0);
  });

  it("決定的（同じ名前は常に同じ結果）", () => {
    const a = colorIndexFor("仕事");
    const b = colorIndexFor("仕事");
    expect(a).toBe(b);
  });

  it("同名同色（別インスタンスの同じ文字列でも一致する）", () => {
    const name1 = "買い" + "物";
    const name2 = "買い物";
    expect(colorIndexFor(name1)).toBe(colorIndexFor(name2));
  });

  it("文字コード合計を8で割った余りになる", () => {
    // "旅行" = U+65C5, U+884C → 26053 + 34892 = 60945 → 60945 % 8 = 1
    expect(colorIndexFor("旅行")).toBe(1);
    // "家庭" = U+5BB6, U+5EAD → 23478 + 24237 = 47715 → 47715 % 8 = 3
    expect(colorIndexFor("家庭")).toBe(3);
  });

  it("8名程度を用意すると複数色に散る（分布）", () => {
    const names = ["仕事", "家庭", "アイデア", "買い物", "旅行", "健康", "学習", "レシピ"];
    const distinct = new Set(names.map(colorIndexFor));
    expect(distinct.size).toBeGreaterThanOrEqual(4);
  });
});

describe("ACCENT_CLASSES", () => {
  it("8色ぶんの名前を持つ", () => {
    expect(ACCENT_CLASSES).toEqual(["red", "orange", "amber", "green", "teal", "blue", "violet", "pink"]);
  });
});

describe("accentClassFor", () => {
  it("acc-<色名> の形式を返す", () => {
    expect(accentClassFor("仕事")).toMatch(/^acc-(red|orange|amber|green|teal|blue|violet|pink)$/);
  });

  it("同名同色（同じタグ名は常に同じクラス）", () => {
    expect(accentClassFor("買い物")).toBe(accentClassFor("買い物"));
  });

  it("colorIndexForと対応するクラス名になる", () => {
    expect(accentClassFor("")).toBe(`acc-${ACCENT_CLASSES[0]}`);
    expect(accentClassFor("旅行")).toBe(`acc-${ACCENT_CLASSES[1]}`);
  });
});
