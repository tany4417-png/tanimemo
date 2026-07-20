// D&Dによる手動並べ替え（メモ・フォルダ共通）で使う純関数群。
// orderKey: 表示順を決める実数値。null=未設定（旧データ・新規作成直後はnull）

export type OrderKeyed = { id: string; orderKey: number | null };

// 挿入位置の前後にある要素のorderKeyから、挿入する要素の新しいorderKeyを計算する。
// 間 = 中点、先頭（prevが無い）= next-1、末尾（nextが無い）= prev+1、両方無い = 0
export function computeOrderKey(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return 0;
  if (prev === null) return (next as number) - 1;
  if (next === null) return prev + 1;
  return (prev + next) / 2;
}

// 現在の並び順のまま、0,1,2,...のorderKeyを振り直した新しい配列を返す（元配列は変更しない）。
// 前後どちらもorderKey未設定で挿入位置を計算できないときの正規化に使う
export function normalizeOrderKeys<T extends OrderKeyed>(items: readonly T[]): T[] {
  return items.map((item, i) => ({ ...item, orderKey: i }));
}

export type ReorderPlan<T extends OrderKeyed> = {
  // 正規化が必要だった場合、書き戻すべき全件（表示順のまま0,1,2,...）。不要ならundefined
  normalized?: T[];
  // ドラッグした要素に書き戻す新しいorderKey
  targetId: string;
  targetOrderKey: number;
};

// 表示中のitems（現在の並び順）から、draggedIdをtargetIdの前/後に挿入するための更新計画を作る。
// targetIdが見つからない場合はnullを返す（呼び出し側は何もしない）。
export function planReorder<T extends OrderKeyed>(
  items: readonly T[],
  draggedId: string,
  targetId: string,
  position: "before" | "after"
): ReorderPlan<T> | null {
  const withoutDragged = items.filter((i) => i.id !== draggedId);
  const targetIndex = withoutDragged.findIndex((i) => i.id === targetId);
  if (targetIndex === -1) return null;

  const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
  const prevItem = insertIndex > 0 ? withoutDragged[insertIndex - 1] : undefined;
  const nextItem = insertIndex < withoutDragged.length ? withoutDragged[insertIndex] : undefined;
  const prevKey = prevItem?.orderKey ?? null;
  const nextKey = nextItem?.orderKey ?? null;

  if (prevKey === null && nextKey === null && withoutDragged.length > 0) {
    return planWithNormalize(withoutDragged, draggedId, insertIndex);
  }

  const key = computeOrderKey(prevKey, nextKey);
  // 重複キーや浮動小数の中点劣化で前後と衝突したら、振り直してから挿入する
  const degenerate = (prevKey !== null && key <= prevKey) || (nextKey !== null && key >= nextKey);
  if (degenerate) {
    return planWithNormalize(withoutDragged, draggedId, insertIndex);
  }

  return { targetId: draggedId, targetOrderKey: key };
}

function planWithNormalize<T extends OrderKeyed>(
  withoutDragged: readonly T[],
  draggedId: string,
  insertIndex: number
): ReorderPlan<T> {
  const normalized = normalizeOrderKeys(withoutDragged);
  const nPrev = insertIndex > 0 ? normalized[insertIndex - 1].orderKey : null;
  const nNext = insertIndex < normalized.length ? normalized[insertIndex].orderKey : null;
  return { normalized, targetId: draggedId, targetOrderKey: computeOrderKey(nPrev, nNext) };
}
