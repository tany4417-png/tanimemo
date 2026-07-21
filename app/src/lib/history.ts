// 編集中テキストのundo/redo履歴。NoteScreenの編集モードで本文の変更履歴を保持するための純関数群。
// past: 古い順の履歴、present: 現在値、future: redoで戻れる先（未来）を新しい順の逆＝直前が先頭。
export type Hist = { past: string[]; present: string; future: string[] };

export function histInit(initial: string): Hist {
  return { past: [], present: initial, future: [] };
}

// presentをpastの末尾へ積み、nextを新presentにする。redo可能だったfutureは破棄する。
// next===presentのときは変更なし（同一参照を返し、無駄なスナップショットを避ける）。
// pastがmaxを超えたら古い方（先頭）から落とす。
export function histPush(h: Hist, next: string, max = 100): Hist {
  if (next === h.present) return h;
  const past = [...h.past, h.present];
  while (past.length > max) past.shift();
  return { past, present: next, future: [] };
}

// pastの末尾を現在に戻し、それまでのpresentをfutureの先頭に積む。pastが空なら不変。
export function histUndo(h: Hist): Hist {
  if (h.past.length === 0) return h;
  const past = h.past.slice(0, -1);
  const prev = h.past[h.past.length - 1];
  return { past, present: prev, future: [h.present, ...h.future] };
}

// futureの先頭を現在に戻し、それまでのpresentをpastの末尾に積む。futureが空なら不変。
export function histRedo(h: Hist): Hist {
  if (h.future.length === 0) return h;
  const [next, ...future] = h.future;
  return { past: [...h.past, h.present], present: next, future };
}

export function canUndo(h: Hist): boolean {
  return h.past.length > 0;
}

export function canRedo(h: Hist): boolean {
  return h.future.length > 0;
}
