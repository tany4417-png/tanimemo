// 名前ハッシュ彩色: タグ名・フォルダ名から決定的にアクセントカラーを割り当てる。
// 文字コード合計を8で割った余りで色を選ぶだけの単純な関数（同じ名前は常に同じ色になる）。
export const ACCENT_CLASSES = ["red", "orange", "amber", "green", "teal", "blue", "violet", "pink"] as const;

export function colorIndexFor(name: string): number {
  if (name.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return sum % ACCENT_CLASSES.length;
}

export function accentClassFor(name: string): string {
  return `acc-${ACCENT_CLASSES[colorIndexFor(name)]}`;
}
