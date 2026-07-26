// mimeから拡張子を引く。既知の画像以外はbin（ファイル名がある添付は名前側の拡張子を優先する）
export function mimeToExt(mime: string): string {
  const map: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };
  return map[mime] ?? "bin";
}
