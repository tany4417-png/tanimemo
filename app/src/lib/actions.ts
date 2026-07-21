// グローバルundo/redo（削除・移動・並べ替え・内容変更などの操作履歴）の操作スタック。
// メモリ内のみで保持する（リロードで消える）。lib/history.ts（NoteScreen編集中のテキストundo/redo）とは別スタック。
// past: 直近の操作ほど末尾。future: redoで戻れる先（undoされた操作。直前にundoしたものが先頭）。
export type Action = { label: string; undo: () => Promise<void>; redo: () => Promise<void> };

export type ActionStacks = { past: Action[]; future: Action[] };

// 新しい操作をpastの末尾へ積む。redo可能だったfutureは破棄する。pastがmaxを超えたら古い方（先頭）から落とす。
export function pushAction(s: ActionStacks, a: Action, max = 50): ActionStacks {
  const past = [...s.past, a];
  while (past.length > max) past.shift();
  return { past, future: [] };
}

// pastの末尾を取り出し、futureの先頭へ積む。取り出した操作は返り値のactionで渡すのみで、
// 実際にundo()を呼ぶかどうかは呼び出し側（App.tsx側）に委ねる。pastが空ならnull（何もしない）。
export function popUndo(s: ActionStacks): { stacks: ActionStacks; action: Action } | null {
  if (s.past.length === 0) return null;
  const action = s.past[s.past.length - 1];
  const past = s.past.slice(0, -1);
  return { stacks: { past, future: [action, ...s.future] }, action };
}

// futureの先頭を取り出し、pastの末尾へ積む。futureが空ならnull（何もしない）。
export function popRedo(s: ActionStacks): { stacks: ActionStacks; action: Action } | null {
  if (s.future.length === 0) return null;
  const [action, ...future] = s.future;
  return { stacks: { past: [...s.past, action], future }, action };
}
