import { describe, expect, it } from "vitest";
import { firstLineTitle, toggleCheckbox } from "./markdown";

describe("toggleCheckbox", () => {
  const body = "買い物\n- [ ] 牛乳\n- [x] パン\n  - [ ] 子タスク";

  it("0番目をオンにする", () => {
    expect(toggleCheckbox(body, 0)).toBe("買い物\n- [x] 牛乳\n- [x] パン\n  - [ ] 子タスク");
  });

  it("1番目をオフにする", () => {
    expect(toggleCheckbox(body, 1)).toBe("買い物\n- [ ] 牛乳\n- [ ] パン\n  - [ ] 子タスク");
  });

  it("インデント付きもトグルできる", () => {
    expect(toggleCheckbox(body, 2)).toBe("買い物\n- [ ] 牛乳\n- [x] パン\n  - [x] 子タスク");
  });

  it("範囲外は変更なし", () => {
    expect(toggleCheckbox(body, 9)).toBe(body);
  });
});

describe("firstLineTitle", () => {
  it("最初の非空行を返す", () => {
    expect(firstLineTitle("\n\nメモの題\n本文")).toBe("メモの題");
  });

  it("見出し記号を除く", () => {
    expect(firstLineTitle("## 見出し")).toBe("見出し");
  });

  it("空なら(無題)", () => {
    expect(firstLineTitle("")).toBe("(無題)");
  });
});
