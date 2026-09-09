import DOMPurify from "dompurify";
import { marked } from "marked";

marked.use({ gfm: true, breaks: true });

// vitestのテスト環境(node、DOM無し)ではDOMPurifyがwindow無しのfactory関数のままで
// addHookを持たない。ブラウザ実行時（本来の対象環境）でのみフックを登録する。
if (typeof DOMPurify.addHook === "function") {
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
    if (node.tagName === "INPUT" && node.getAttribute("type") === "checkbox") {
      node.removeAttribute("disabled");
    }
  });
}

// 各ブロックの先頭タグへ、原文（Markdown）での開始位置をdata-srcとして入れる。
// 閲覧中にタップした場所から編集を始めるための手がかりで、DOMPurifyはdata-*をそのまま残す
function withSrcPos(html: string, pos: number): string {
  return html.replace(/^(\s*<[a-zA-Z][a-zA-Z0-9-]*)/, `$1 data-src="${pos}"`);
}

export function renderMarkdown(body: string): string {
  // ブロック単位で位置を数えるためlexer→parserに分ける。トップレベルのトークンだけを見るので、
  // 箇条書きや引用はまとまりごとに1つのdata-srcになる
  const tokens = marked.lexer(body);
  let pos = 0;
  let html = "";
  for (const token of tokens) {
    const part = marked.parser([token], { async: false }) as string;
    if (part.trim() !== "") html += withSrcPos(part, pos);
    pos += token.raw.length;
  }
  return DOMPurify.sanitize(html);
}

export function toggleCheckbox(body: string, index: number): string {
  let seen = -1;
  return body
    .split("\n")
    .map((line) => {
      const m = line.match(/^(\s*[-*]\s*)\[([ xX])\](.*)$/);
      if (!m) return line;
      seen += 1;
      if (seen !== index) return line;
      const next = m[2] === " " ? "x" : " ";
      return `${m[1]}[${next}]${m[3]}`;
    })
    .join("\n");
}

export function firstLineTitle(body: string): string {
  const line = body.split("\n").find((l) => l.trim() !== "") ?? "";
  return line.replace(/^#+\s*/, "").trim() || "(無題)";
}

export function urlOnly(body: string): string | null {
  const lines = body.split("\n").map((l) => l.trim()).filter((l) => l !== "");
  if (lines.length === 1 && /^https?:\/\/\S+$/.test(lines[0])) return lines[0];
  return null;
}
