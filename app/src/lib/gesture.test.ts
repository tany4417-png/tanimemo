import { describe, expect, it } from "vitest";
import { isTap, shouldCompleteBack, shouldEnterMouseDrag, shouldOpenSwipe } from "./gesture";

describe("shouldOpenSwipe", () => {
  it("40pxを超えて左に動けば開いた状態にする", () => {
    expect(shouldOpenSwipe(-41)).toBe(true);
  });

  it("ちょうど40pxでは開かない", () => {
    expect(shouldOpenSwipe(-40)).toBe(false);
  });

  it("40px未満の左移動では開かない", () => {
    expect(shouldOpenSwipe(-20)).toBe(false);
  });

  it("右方向の移動では開かない（開いた状態からの右スワイプは閉じる判定に使う）", () => {
    expect(shouldOpenSwipe(10)).toBe(false);
  });
});

describe("isTap", () => {
  it("ほぼ動いていなければタップとみなす", () => {
    expect(isTap(2, false, false)).toBe(true);
  });

  it("10px以上動いた指離しはタップとみなさない", () => {
    expect(isTap(15, false, false)).toBe(false);
  });

  it("スワイプ判定に入っていた場合はタップとみなさない", () => {
    expect(isTap(2, true, false)).toBe(false);
  });

  it("ドラッグモードに入っていた場合はタップとみなさない", () => {
    expect(isTap(2, false, true)).toBe(false);
  });
});

describe("shouldEnterMouseDrag", () => {
  it("8pxを超えて動けばドラッグモードに入る", () => {
    expect(shouldEnterMouseDrag(9)).toBe(true);
  });

  it("ちょうど8pxでは入らない", () => {
    expect(shouldEnterMouseDrag(8)).toBe(false);
  });

  it("8px未満では入らない", () => {
    expect(shouldEnterMouseDrag(3)).toBe(false);
  });
});

describe("shouldCompleteBack", () => {
  it("90pxを超えて動いていれば速度に関わらず戻り完了とみなす", () => {
    expect(shouldCompleteBack(91, 0)).toBe(true);
  });

  it("ちょうど90pxでは戻り完了とみなさない（速度が無ければ）", () => {
    expect(shouldCompleteBack(90, 0)).toBe(false);
  });

  it("50pxを超えていて速度も十分なら戻り完了とみなす", () => {
    expect(shouldCompleteBack(60, 0.6)).toBe(true);
  });

  it("ちょうど50pxでは速度が十分でも戻り完了とみなさない", () => {
    expect(shouldCompleteBack(50, 10)).toBe(false);
  });

  it("ちょうど0.5の速度では戻り完了とみなさない", () => {
    expect(shouldCompleteBack(51, 0.5)).toBe(false);
  });

  it("50pxを超えていても速度が足りなければ戻り完了とみなさない", () => {
    expect(shouldCompleteBack(60, 0.4)).toBe(false);
  });

  it("50px以下では速度がどれだけ速くても戻り完了とみなさない", () => {
    expect(shouldCompleteBack(30, 5)).toBe(false);
  });

  it("左方向（負のdx）では戻り完了とみなさない", () => {
    expect(shouldCompleteBack(-100, 2)).toBe(false);
  });
});
