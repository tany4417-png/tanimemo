import { describe, expect, it } from "vitest";
import { isTap, shouldOpenSwipe } from "./gesture";

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
