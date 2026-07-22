// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { highlightMatches } from "./highlight";

function div(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

describe("highlightMatches", () => {
  it("単一テキストノード内のマッチをmarkで包み、最初のmarkを返す", () => {
    const el = div("<p>今日はナスの苗を植えた</p>");
    const first = highlightMatches(el, "ナス");
    expect(el.innerHTML).toBe('<p>今日は<mark class="search-hit">ナス</mark>の苗を植えた</p>');
    expect(first?.textContent).toBe("ナス");
  });

  it("同一ノード内の複数マッチをすべて包む", () => {
    const el = div("<p>ナスとナスとナス</p>");
    highlightMatches(el, "ナス");
    expect(el.querySelectorAll("mark.search-hit").length).toBe(3);
  });

  it("冪等: 同じrootに二度呼んでも入れ子markを作らない", () => {
    const el = div("<p>今日はナスの苗を植えた</p>");
    highlightMatches(el, "ナス");
    const second = highlightMatches(el, "ナス");
    expect(el.querySelectorAll("mark.search-hit").length).toBe(1);
    expect(el.querySelector("mark.search-hit mark")).toBeNull();
    // 2回目は新規マッチが無いのでnull（ジャンプ側はjumpedRefで1回制御しているため影響なし）
    expect(second).toBeNull();
  });

  it("複数要素それぞれのマッチを包み、最初の出現を返す", () => {
    const el = div("<p>一つ目のナス</p><ul><li>二つ目のナス</li></ul>");
    const first = highlightMatches(el, "ナス");
    expect(el.querySelectorAll("mark.search-hit").length).toBe(2);
    expect(first).toBe(el.querySelector("mark"));
  });

  it("大文字小文字を無視してマッチする", () => {
    const el = div("<p>Use React and react-dom</p>");
    highlightMatches(el, "react");
    expect(el.querySelectorAll("mark.search-hit").length).toBe(2);
  });

  it("前後の空白はトリムして探す（検索ボックスの入力そのままを受ける）", () => {
    const el = div("<p>ナスの苗</p>");
    const first = highlightMatches(el, " ナス ");
    expect(first?.textContent).toBe("ナス");
  });

  it("マッチ無しはnullを返しDOMを変えない", () => {
    const el = div("<p>キュウリ</p>");
    expect(highlightMatches(el, "ナス")).toBeNull();
    expect(el.innerHTML).toBe("<p>キュウリ</p>");
  });

  it("空・空白のみのクエリは何もしない", () => {
    const el = div("<p>ナス</p>");
    expect(highlightMatches(el, "")).toBeNull();
    expect(highlightMatches(el, "  ")).toBeNull();
    expect(el.innerHTML).toBe("<p>ナス</p>");
  });
});
