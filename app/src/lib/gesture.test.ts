import { describe, expect, it } from "vitest";
import { isTap, shouldCommitSwipe } from "./gesture";

describe("shouldCommitSwipe", () => {
  it("120px近く動く従来の長距離スワイプは確定する", () => {
    expect(shouldCommitSwipe(-120, 0)).toBe(true);
  });

  it("110px未満かつ遅ければ確定しない", () => {
    expect(shouldCommitSwipe(-80, -0.1)).toBe(false);
  });

  it("短距離でも速い左フリックなら確定する", () => {
    expect(shouldCommitSwipe(-70, -0.8)).toBe(true);
  });

  it("60px未満なら速くても確定しない", () => {
    expect(shouldCommitSwipe(-50, -2)).toBe(false);
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
