import { describe, it, expect } from "vitest";
import { pickTopVisible, pickForPos, scrollTopForCharPos, charPosFromScroll, type Block } from "./srcpos";

const blocks: Block[] = [
  { pos: 0, top: 0 },
  { pos: 20, top: 100 },
  { pos: 55, top: 260 },
  { pos: 90, top: 500 },
];

describe("pickTopVisible", () => {
  it("表示領域の上端に来ているブロックの原文位置を返す", () => {
    expect(pickTopVisible(blocks, 280)).toBe(55);
  });

  it("ブロックの途中にいるときは、そのブロックを返す", () => {
    expect(pickTopVisible(blocks, 150)).toBe(20);
  });

  it("最上部では先頭を返す", () => {
    expect(pickTopVisible(blocks, 0)).toBe(0);
  });

  it("最後まで送ったら最後のブロックを返す", () => {
    expect(pickTopVisible(blocks, 9999)).toBe(90);
  });

  it("ブロックが無ければnull", () => {
    expect(pickTopVisible([], 100)).toBeNull();
  });
});

describe("pickForPos", () => {
  it("その位置を含むブロックを返す", () => {
    expect(pickForPos(blocks, 60)?.top).toBe(260);
  });

  it("ブロックの先頭ちょうどでもそのブロックを返す", () => {
    expect(pickForPos(blocks, 20)?.top).toBe(100);
  });

  it("先頭より前なら最初のブロックを返す", () => {
    expect(pickForPos(blocks, -5)?.top).toBe(0);
  });

  it("ブロックが無ければnull", () => {
    expect(pickForPos([], 10)).toBeNull();
  });
});

describe("scrollTopForCharPos / charPosFromScroll", () => {
  const box = { scrollHeight: 2000, clientHeight: 500 };

  it("本文の半分の位置なら、スクロールも半分にする", () => {
    expect(scrollTopForCharPos(box, 50, 100)).toBe(750);
  });

  it("本文が空ならスクロールしない", () => {
    expect(scrollTopForCharPos(box, 0, 0)).toBe(0);
  });

  it("スクロールできない短い本文では0", () => {
    expect(scrollTopForCharPos({ scrollHeight: 300, clientHeight: 500 }, 50, 100)).toBe(0);
  });

  it("行き過ぎた位置は末尾で止める", () => {
    expect(scrollTopForCharPos(box, 200, 100)).toBe(1500);
  });

  it("スクロール位置から、上端あたりの文字位置を逆算する", () => {
    expect(charPosFromScroll({ scrollTop: 750, ...box }, 100)).toBe(50);
  });

  it("逆算もスクロールできない要素では0", () => {
    expect(charPosFromScroll({ scrollTop: 0, scrollHeight: 300, clientHeight: 500 }, 100)).toBe(0);
  });
});
