import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./clipboard";

// navigator.clipboard の差し替え。テスト間で必ず元へ戻す
function setClipboard(value: unknown) {
  Object.defineProperty(globalThis, "navigator", {
    value: value === undefined ? {} : { clipboard: value },
    configurable: true,
    writable: true,
  });
}

const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");

afterEach(() => {
  if (original) Object.defineProperty(globalThis, "navigator", original);
});

describe("copyText", () => {
  it("clipboardへ書けたらtrueを返し、渡した文字列をそのまま渡す", async () => {
    const writeText = vi.fn(async () => {});
    setClipboard({ writeText });
    expect(await copyText("1行目\n2行目")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("1行目\n2行目");
  });

  it("clipboard APIが無い環境ではfalseを返す（例外は投げない）", async () => {
    setClipboard(undefined);
    expect(await copyText("本文")).toBe(false);
  });

  it("writeTextが失敗したらfalseを返す（権限拒否など）", async () => {
    setClipboard({ writeText: async () => { throw new Error("NotAllowedError"); } });
    expect(await copyText("本文")).toBe(false);
  });

  it("空文字でも書き込みを試みる", async () => {
    const writeText = vi.fn(async () => {});
    setClipboard({ writeText });
    expect(await copyText("")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("");
  });
});
