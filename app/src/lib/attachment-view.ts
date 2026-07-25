import { mimeToExt } from "./mime";

export function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

// nameを持たない旧データの表示名。保存はせず表示のたびに導出する
export function fallbackName(mime: string, createdAt: number): string {
  const d = new Date(createdAt);
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  return `${isImageMime(mime) ? "画像" : "ファイル"}-${stamp}.${mimeToExt(mime)}`;
}
