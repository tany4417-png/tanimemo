import { describe, expect, it } from "vitest";
import { mimeToExt } from "./mime";

describe("mimeToExt", () => {
  it("既知の型を変換し未知はbin", () => {
    expect(mimeToExt("image/png")).toBe("png");
    expect(mimeToExt("image/jpeg")).toBe("jpg");
    expect(mimeToExt("application/x-unknown")).toBe("bin");
  });
});
