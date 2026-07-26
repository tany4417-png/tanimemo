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

// ファイル名から拡張子を取り出す（大文字小文字は変えない）。取れなければ空文字
export function extFromName(name: string | undefined): string {
  const dot = name ? name.lastIndexOf(".") : -1;
  return dot > 0 && name && dot < name.length - 1 ? name.slice(dot + 1) : "";
}

// 行頭に出す拡張子ラベル。ファイル名の拡張子を優先し、無ければmimeから引く
export function extLabel(name: string | undefined, mime: string): string {
  return (extFromName(name) || mimeToExt(mime)).slice(0, 4).toUpperCase();
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
