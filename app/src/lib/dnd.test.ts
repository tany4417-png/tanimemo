import { describe, expect, it } from "vitest";
import { parseDropFolder } from "./dnd";

describe("parseDropFolder", () => {
  it("nullなら要素が見つからなかったことを表す\"none\"を返す", () => {
    expect(parseDropFolder(null)).toBe("none");
  });

  it("\"root\"はルート（null）に変換する", () => {
    expect(parseDropFolder("root")).toBeNull();
  });

  it("フォルダIDの文字列はそのまま返す", () => {
    expect(parseDropFolder("01ABCXYZDUMMYFOLDERID0001")).toBe("01ABCXYZDUMMYFOLDERID0001");
  });
});
