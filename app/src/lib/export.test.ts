import { describe, expect, it } from "vitest";
import type { Note } from "./types";
import { mimeToExt, noteContent, notePath, slugify } from "./export";

function n(over: Partial<Note> = {}): Note {
  return {
    id: "01HZXW3E8PDEMO0000000000AB", body: "買い物メモ\n- [ ] 牛乳", tags: ["家"], importance: 2,
    createdAt: new Date("2026-07-20T09:00:00").getTime(), updatedAt: 0, deleted: 0, dirty: 0, ...over,
  };
}

describe("エクスポートの純関数", () => {
  it("slugifyは記号と空白をハイフンにし30文字に切る", () => {
    expect(slugify("買い物 メモ/夏")).toBe("買い物-メモ-夏");
    expect(slugify("   ")).toBe("memo");
    expect(slugify("あ".repeat(40))).toHaveLength(30);
  });

  it("mimeToExtは既知の型を変換し未知はbin", () => {
    expect(mimeToExt("image/png")).toBe("png");
    expect(mimeToExt("image/jpeg")).toBe("jpg");
    expect(mimeToExt("application/x-unknown")).toBe("bin");
  });

  it("notePathは日付-タイトル-ID末尾4桁.md", () => {
    expect(notePath(n())).toBe("2026-07-20-買い物メモ-00AB.md");
  });

  it("noteContentはフロントマター付き", () => {
    const c = noteContent(n());
    expect(c).toContain('tags: ["家"]');
    expect(c).toContain("importance: 2");
    expect(c.endsWith("買い物メモ\n- [ ] 牛乳\n")).toBe(true);
  });
});
