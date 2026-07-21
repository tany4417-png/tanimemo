// ChromiumのDownloadURL dataTransfer形式（"mime:filename:url"）を組み立てる純関数。
// ギャラリー画像をOS（エクスプローラー等）へドラッグアウトするときに使う。Chromium限定の仕組みだが、
// この文字列を組み立てて setData するだけなので、対応していないブラウザで使っても無害
export function downloadUrlSpec(mime: string, filename: string, url: string): string {
  return `${mime}:${filename}:${url}`;
}
