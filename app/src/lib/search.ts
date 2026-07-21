// 検索スニペット: 検索中の一覧カードに出す「マッチ箇所の抜粋」を作る純関数。
// マッチ判定は searchNotes（sort.ts）と同じ小文字化部分一致。表示側でJSXの<mark>を組めるよう
// HTML文字列ではなく構造化データで返す（renderMarkdownを介さない＝サニタイズ問題を持ち込まない）。
export type Snippet = { before: string; match: string; after: string };

// 改行・連続空白は空白1つに寄せる（スニペットは1行表示）。文脈が切れている側には「…」を付ける。
// マッチ無し・空クエリはnull。
export function makeSnippet(body: string, query: string, ctx = 20): Snippet | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const flat = body.replace(/\s+/g, " ");
  const idx = flat.toLowerCase().indexOf(q);
  if (idx < 0) return null;
  const start = Math.max(0, idx - ctx);
  const end = Math.min(flat.length, idx + q.length + ctx);
  return {
    before: (start > 0 ? "…" : "") + flat.slice(start, idx),
    match: flat.slice(idx, idx + q.length),
    after: flat.slice(idx + q.length, end) + (end < flat.length ? "…" : ""),
  };
}
