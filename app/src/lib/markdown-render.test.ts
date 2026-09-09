// @vitest-environment jsdom
// renderMarkdownはDOMPurifyを通すためDOMが要る（node環境ではsanitizeが生えない）ので、
// 描画まわりの検証だけこのファイルへ分けている
import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown の位置情報", () => {
  it("段落ごとに原文の開始位置をdata-srcで持たせる", () => {
    const body = "一行目\n\n二行目";
    const html = renderMarkdown(body);
    expect(html).toContain('<p data-src="0"');
    expect(html).toContain(`data-src="${body.indexOf("二行目")}"`);
  });

  it("見出しにも付く", () => {
    const body = "## 見出し\n\n本文です";
    const html = renderMarkdown(body);
    expect(html).toContain('<h2 data-src="0"');
    expect(html).toContain(`data-src="${body.indexOf("本文です")}"`);
  });

  it("箇条書きはまとまりごとに1つ付く", () => {
    const html = renderMarkdown("- あ\n- い");
    expect(html).toContain('<ul data-src="0"');
  });

  it("チェックボックスは従来どおり出る", () => {
    const html = renderMarkdown("- [ ] あ\n- [x] い");
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(2);
  });

  it("リンクは従来どおり別タブで開く", () => {
    const html = renderMarkdown("[例](https://example.com)");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("空の本文でも落ちない", () => {
    expect(renderMarkdown("")).toBe("");
  });
});
