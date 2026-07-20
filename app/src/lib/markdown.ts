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

export function renderMarkdown(body: string): string {
  const html = marked.parse(body, { async: false }) as string;
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
