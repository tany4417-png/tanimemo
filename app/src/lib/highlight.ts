// 閲覧モード本文(.note-view)内の検索ヒットを<mark class="search-hit">で包むDOM操作。
// renderMarkdownのサニタイズ済み文字列は後加工しない（文字列加工はmXSSの温床・教訓済み）。
// DOM挿入後のテキストノード分割＋要素挿入は再パースを伴わないため安全。
// マッチは単一テキストノード内のみ対応（要素をまたぐマッチは拾わない＝飛べないだけの劣化で許容）。
// 冪等: 適用済みのmark内テキストは走査対象から除くため、同じrootに再度呼んでも入れ子markを作らない
// （dev StrictModeのeffect二重実行や、部分的に素へ戻ったDOMへの再適用で必要になる）。
export function highlightMatches(root: HTMLElement, query: string): HTMLElement | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  // 走査中にsplitTextでツリーを変えると順序が乱れるため、対象テキストノードを先に集めきる
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!(n.parentElement?.closest("mark.search-hit"))) textNodes.push(n as Text);
  }
  let first: HTMLElement | null = null;
  for (const node of textNodes) {
    let rest = node;
    // 同一ノード内の複数マッチ: 包んだ残り(rest)を続けて探索する
    for (;;) {
      const idx = rest.data.toLowerCase().indexOf(q);
      if (idx < 0) break;
      const hit = rest.splitText(idx);
      const after = hit.splitText(q.length);
      const mark = document.createElement("mark");
      mark.className = "search-hit";
      hit.parentNode?.replaceChild(mark, hit);
      mark.appendChild(hit);
      if (!first) first = mark;
      rest = after;
    }
  }
  return first;
}
