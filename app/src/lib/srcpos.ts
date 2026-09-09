// 閲覧（Markdownを描いたHTML）と編集（原文のtextarea）の間で、読んでいる場所を受け渡すための計算。
// renderMarkdownが各ブロックへ入れたdata-src（原文の開始位置）が手がかりになる。

export type Block = {
  // 原文（Markdown）での開始位置
  pos: number;
  // 表示上の位置（スクロールコンテナ内のoffsetTop）
  top: number;
};

// 表示領域の上端に来ているブロックの原文位置。「上端より上で始まっている最後のブロック」を選ぶ
export function pickTopVisible(blocks: Block[], viewTop: number): number | null {
  if (blocks.length === 0) return null;
  let found = blocks[0];
  for (const b of blocks) {
    if (b.top > viewTop) break;
    found = b;
  }
  return found.pos;
}

// 原文の位置を含むブロック。閲覧側へ戻るときのスクロール先に使う
export function pickForPos(blocks: Block[], pos: number): Block | null {
  if (blocks.length === 0) return null;
  let found = blocks[0];
  for (const b of blocks) {
    if (b.pos > pos) break;
    found = b;
  }
  return found;
}

type ScrollBox = { scrollHeight: number; clientHeight: number };

// 原文の文字位置が見えるように、編集欄のスクロール位置を求める。
// textareaは等幅で流し込むだけなので、文字数の比率と高さの比率がおおむね一致する
export function scrollTopForCharPos(el: ScrollBox, pos: number, total: number): number {
  const max = el.scrollHeight - el.clientHeight;
  if (max <= 0 || total <= 0) return 0;
  const ratio = Math.min(Math.max(pos / total, 0), 1);
  return Math.round(max * ratio);
}

// 編集欄のスクロール位置から、上端あたりに来ている原文の文字位置を逆算する
export function charPosFromScroll(el: ScrollBox & { scrollTop: number }, total: number): number {
  const max = el.scrollHeight - el.clientHeight;
  if (max <= 0 || total <= 0) return 0;
  return Math.round(total * Math.min(Math.max(el.scrollTop / max, 0), 1));
}

// 閲覧中の本文から、位置の手がかりを持つブロックを集める。
// originTopにはスクロールコンテナのgetBoundingClientRect().topを渡す。返すtopはコンテナ上端からの
// 距離になり、0がちょうど上端。相対値なので、そのままスクロール量の増減に使える
export function collectBlocks(root: HTMLElement, originTop: number): Block[] {
  return [...root.querySelectorAll<HTMLElement>("[data-src]")].map((el) => ({
    pos: Number(el.dataset.src ?? 0),
    top: el.getBoundingClientRect().top - originTop,
  }));
}
