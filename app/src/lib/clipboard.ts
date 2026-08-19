// クリップボードへの書き込み。失敗しても投げずに真偽値で返す（呼び出し側でボタンの表示を切り替えるため）。
// navigator.clipboard はHTTPSかlocalhostでしか生えないので、無い場合もfalseで扱う
export async function copyText(text: string): Promise<boolean> {
  const clipboard = navigator.clipboard;
  if (!clipboard) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
