import { describe, expect, it } from "vitest";
import { canRedo, canUndo, histInit, histPush, histRedo, histUndo } from "./history";

describe("histInit", () => {
  it("presentに初期値、past/futureは空", () => {
    const h = histInit("hello");
    expect(h).toEqual({ past: [], present: "hello", future: [] });
  });
});

describe("histPush", () => {
  it("presentをpastへ積み、nextをpresentにし、futureをクリアする", () => {
    const h0 = histInit("a");
    const h1 = histPush(h0, "b");
    expect(h1).toEqual({ past: ["a"], present: "b", future: [] });
  });

  it("次のpushでもpastが積み上がる", () => {
    let h = histInit("a");
    h = histPush(h, "b");
    h = histPush(h, "c");
    expect(h).toEqual({ past: ["a", "b"], present: "c", future: [] });
  });

  it("next===presentなら変更なし（同一参照を返す）", () => {
    const h0 = histInit("a");
    const h1 = histPush(h0, "a");
    expect(h1).toBe(h0);
  });

  it("undo後にpushするとfutureが破棄される", () => {
    let h = histInit("a");
    h = histPush(h, "b");
    h = histPush(h, "c");
    h = histUndo(h); // present: b, future: [c]
    h = histPush(h, "d");
    expect(h).toEqual({ past: ["a", "b"], present: "d", future: [] });
  });

  it("pastがmaxを超えたら先頭を落とす", () => {
    let h = histInit("0");
    for (let i = 1; i <= 5; i++) h = histPush(h, String(i), 3);
    // max=3: pastは直近3件のみ保持
    expect(h.past).toEqual(["2", "3", "4"]);
    expect(h.present).toBe("5");
  });
});

describe("histUndo / histRedo", () => {
  it("undoでpresentが1つ前に戻り、futureの先頭に積まれる", () => {
    let h = histInit("a");
    h = histPush(h, "b");
    h = histPush(h, "c");
    h = histUndo(h);
    expect(h).toEqual({ past: ["a"], present: "b", future: ["c"] });
  });

  it("undoを繰り返して往復できる", () => {
    let h = histInit("a");
    h = histPush(h, "b");
    h = histPush(h, "c");
    h = histUndo(h);
    h = histUndo(h);
    expect(h).toEqual({ past: [], present: "a", future: ["b", "c"] });
  });

  it("pastが空ならundoしても不変（同一参照）", () => {
    const h0 = histInit("a");
    const h1 = histUndo(h0);
    expect(h1).toBe(h0);
  });

  it("redoでfutureの先頭がpresentに戻り、pastに積まれる", () => {
    let h = histInit("a");
    h = histPush(h, "b");
    h = histPush(h, "c");
    h = histUndo(h);
    h = histUndo(h);
    h = histRedo(h);
    expect(h).toEqual({ past: ["a"], present: "b", future: ["c"] });
  });

  it("undo→redoを繰り返して元に戻る", () => {
    let h = histInit("a");
    h = histPush(h, "b");
    h = histPush(h, "c");
    const original = h;
    h = histUndo(h);
    h = histUndo(h);
    h = histRedo(h);
    h = histRedo(h);
    expect(h).toEqual(original);
  });

  it("futureが空ならredoしても不変（同一参照）", () => {
    const h0 = histInit("a");
    const h1 = histRedo(h0);
    expect(h1).toBe(h0);
  });
});

describe("canUndo / canRedo", () => {
  it("pastが空ならcanUndoはfalse、あればtrue", () => {
    const h0 = histInit("a");
    expect(canUndo(h0)).toBe(false);
    const h1 = histPush(h0, "b");
    expect(canUndo(h1)).toBe(true);
  });

  it("futureが空ならcanRedoはfalse、あればtrue", () => {
    let h = histInit("a");
    h = histPush(h, "b");
    expect(canRedo(h)).toBe(false);
    h = histUndo(h);
    expect(canRedo(h)).toBe(true);
  });
});
