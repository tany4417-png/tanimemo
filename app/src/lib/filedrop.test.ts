import { describe, it, expect } from "vitest";
import { filesFromDataTransfer, hasFiles } from "./filedrop";

function dt(files: File[], types: string[] = ["Files"]): DataTransfer {
  return { files: files as unknown as FileList, types } as unknown as DataTransfer;
}

describe("filesFromDataTransfer", () => {
  it("ファイルを配列で返す", () => {
    const f = new File([new Uint8Array([1])], "a.pdf", { type: "application/pdf" });
    expect(filesFromDataTransfer(dt([f]))).toHaveLength(1);
  });
  it("nullは空配列", () => {
    expect(filesFromDataTransfer(null)).toEqual([]);
  });
});

describe("hasFiles", () => {
  it("typesにFilesがあれば真", () => {
    expect(hasFiles(dt([], ["Files"]))).toBe(true);
  });
  it("テキストのドラッグは偽（メモ内のテキスト選択をドラッグしたとき用）", () => {
    expect(hasFiles(dt([], ["text/plain"]))).toBe(false);
  });
  it("nullは偽", () => {
    expect(hasFiles(null)).toBe(false);
  });
});
