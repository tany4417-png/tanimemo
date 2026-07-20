import { describe, expect, it } from "vitest";
import { computeOrderKey, normalizeOrderKeys, planReorder } from "./reorder";

describe("computeOrderKey", () => {
  it("前後がある場合は中点を返す", () => {
    expect(computeOrderKey(1, 3)).toBe(2);
  });

  it("先頭（prevが無い）はnext-1を返す", () => {
    expect(computeOrderKey(null, 5)).toBe(4);
  });

  it("末尾（nextが無い）はprev+1を返す", () => {
    expect(computeOrderKey(5, null)).toBe(6);
  });

  it("両方無ければ0を返す", () => {
    expect(computeOrderKey(null, null)).toBe(0);
  });
});

describe("normalizeOrderKeys", () => {
  it("現在の並び順のまま0,1,2,...を振り直す", () => {
    const items = [
      { id: "a", orderKey: null },
      { id: "b", orderKey: 99 },
      { id: "c", orderKey: null },
    ];
    const r = normalizeOrderKeys(items);
    expect(r.map((x) => [x.id, x.orderKey])).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 2],
    ]);
  });

  it("元配列を破壊しない", () => {
    const items = [{ id: "a", orderKey: null }];
    normalizeOrderKeys(items);
    expect(items[0].orderKey).toBeNull();
  });

  it("空配列を渡すと空配列を返す", () => {
    expect(normalizeOrderKeys([])).toEqual([]);
  });
});

describe("planReorder", () => {
  it("orderKeyが両方とも数値のとき、中点を挿入先に計算する（正規化不要）", () => {
    const items = [
      { id: "a", orderKey: 0 },
      { id: "b", orderKey: 2 },
      { id: "c", orderKey: 4 },
    ];
    const plan = planReorder(items, "c", "b", "before");
    expect(plan).toEqual({ targetId: "c", targetOrderKey: 1 });
  });

  it("先頭への挿入はnext-1", () => {
    const items = [
      { id: "a", orderKey: 0 },
      { id: "b", orderKey: 2 },
    ];
    const plan = planReorder(items, "b", "a", "before");
    expect(plan).toEqual({ targetId: "b", targetOrderKey: -1 });
  });

  it("末尾への挿入はprev+1", () => {
    const items = [
      { id: "a", orderKey: 0 },
      { id: "b", orderKey: 2 },
    ];
    const plan = planReorder(items, "a", "b", "after");
    expect(plan).toEqual({ targetId: "a", targetOrderKey: 3 });
  });

  it("挿入位置の前後がどちらもorderKey未設定なら、リスト全体を表示順で正規化してから挿入する", () => {
    const items = [
      { id: "a", orderKey: null },
      { id: "b", orderKey: null },
      { id: "c", orderKey: null },
    ];
    // dragged=c を a と b の間へ（表示順のまま正規化するとa=0,b=1,c(除外後)=1想定→cは0.5相当ではなく中点計算）
    const plan = planReorder(items, "c", "b", "before");
    expect(plan?.normalized).toEqual([
      { id: "a", orderKey: 0 },
      { id: "b", orderKey: 1 },
    ]);
    expect(plan?.targetId).toBe("c");
    expect(plan?.targetOrderKey).toBe(0.5);
  });

  it("挿入先の前後の片方だけnullの混在では正規化せず、表示順のキーをそのまま使う", () => {
    const items = [
      { id: "a", orderKey: null },
      { id: "b", orderKey: 10 },
      { id: "c", orderKey: null },
    ];
    // dragged=c（末尾に表示中）を b の前へ挿入。前(a=null)/次(b=10)は片方だけnullなので正規化しない
    const plan = planReorder(items, "c", "b", "before");
    expect(plan).toEqual({ targetId: "c", targetOrderKey: 9 });
  });

  it("対象idが見つからない場合はnullを返す", () => {
    const items = [{ id: "a", orderKey: 0 }];
    expect(planReorder(items, "a", "missing", "before")).toBeNull();
  });

  it("ドラッグ対象自身をtargetにしても、自身を除いたリストから計算する", () => {
    const items = [
      { id: "a", orderKey: 0 },
      { id: "b", orderKey: 2 },
      { id: "c", orderKey: 4 },
    ];
    // b を動かして a の後ろへ（before=false相当）にドロップし直すケース
    const plan = planReorder(items, "b", "a", "after");
    expect(plan).toEqual({ targetId: "b", targetOrderKey: 2 });
  });
});
