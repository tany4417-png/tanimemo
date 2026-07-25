import { describe, it, expect } from "vitest";
import { extLabel, fallbackName, formatSize, isImageMime } from "./attachment-view";

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

describe("extLabel", () => {
  it("ファイル名の拡張子を大文字で返す", () => {
    expect(extLabel("見積書.pdf", "application/pdf")).toBe("PDF");
    expect(extLabel("表.xlsx", "application/octet-stream")).toBe("XLSX");
  });
  it("4文字を超える拡張子は切り詰める", () => {
    expect(extLabel("a.jpeg2000", "application/octet-stream")).toBe("JPEG");
  });
  it("名前が無ければmimeから引く", () => {
    expect(extLabel(undefined, "image/png")).toBe("PNG");
    expect(extLabel(undefined, "application/pdf")).toBe("BIN");
  });
  it("拡張子の無い名前はmimeにフォールバックする", () => {
    expect(extLabel("README", "image/png")).toBe("PNG");
  });
});

describe("formatSize", () => {
  it("単位を切り替える", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(2048)).toBe("2 KB");
    expect(formatSize(1024 * 1024 * 3.5)).toBe("3.5 MB");
  });
});
