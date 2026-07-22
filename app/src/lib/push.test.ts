import { describe, it, expect } from "vitest";
import { urlBase64ToUint8Array } from "./push";

describe("urlBase64ToUint8Array", () => {
  it("base64url文字列をUint8Arrayに変換する", () => {
    // "AQID" = [1,2,3]
    expect(Array.from(urlBase64ToUint8Array("AQID"))).toEqual([1, 2, 3]);
  });
  it("-_ を +/ として扱う（base64url）", () => {
    expect(() => urlBase64ToUint8Array("a-b_")).not.toThrow();
  });
});
