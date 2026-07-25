import { describe, it, expect } from "vitest";
import { fallbackName, isImageMime } from "./attachment-view";

describe("isImageMime", () => {
  it("image/*だけ真", () => {
    expect(isImageMime("image/png")).toBe(true);
    expect(isImageMime("application/pdf")).toBe(false);
    expect(isImageMime("")).toBe(false);
  });
});

describe("fallbackName", () => {
  it("画像は「画像-日時.拡張子」", () => {
    // 2026-07-26 09:05 ローカル
    const at = new Date(2026, 6, 26, 9, 5).getTime();
    expect(fallbackName("image/png", at)).toBe("画像-20260726-0905.png");
  });
  it("非画像は「ファイル-日時.拡張子」で、未知mimeはbin", () => {
    const at = new Date(2026, 6, 26, 9, 5).getTime();
    expect(fallbackName("application/pdf", at)).toBe("ファイル-20260726-0905.bin");
  });
});
