import DOMPurify from "dompurify";
import { marked } from "marked";

marked.use({ gfm: true, breaks: true });

export function renderMarkdown(body: string): string {
  const html = marked.parse(body, { async: false }) as string;
  const clean = DOMPurify.sanitize(html);
  return clean
    .replace(/(<input[^>]*?)\sdisabled(="")?/g, "$1")
    .replace(/<a href=/g, '<a target="_blank" rel="noopener" href=');
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
