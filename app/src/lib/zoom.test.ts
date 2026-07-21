import { describe, expect, it } from "vitest";
import { clampPan, clampScale, DOUBLE_TAP_SCALE, MAX_SCALE, MIN_SCALE, pinchScale, zoomAt } from "./zoom";

describe("clampScale", () => {
  it("下限1・上限4に収める", () => {
    expect(clampScale(0.5)).toBe(MIN_SCALE);
    expect(clampScale(2)).toBe(2);
    expect(clampScale(9)).toBe(MAX_SCALE);
  });
});

describe("zoomAt", () => {
  it("基準点の直下にある画像上の点が拡大後も動かない", () => {
    // 等倍・無移動から(100,50)を基準に2倍へ。基準点直下の画像座標u=(100,50)が
    // 変換後も p = u*scale + t = (100,50) のまま
    const next = zoomAt({ scale: 1, tx: 0, ty: 0 }, 100, 50, 2);
    expect(next.scale).toBe(2);
    expect(100 * 2 + next.tx).toBeCloseTo(100);
    expect(50 * 2 + next.ty).toBeCloseTo(50);
  });

  it("既に移動・拡大済みの状態からでも基準点が固定される", () => {
    const cur = { scale: 2, tx: -40, ty: 10 };
    const next = zoomAt(cur, 30, -20, 3);
    // 基準点直下の画像座標 u = (p - t) / s
    const ux = (30 - cur.tx) / cur.scale;
    const uy = (-20 - cur.ty) / cur.scale;
    expect(ux * next.scale + next.tx).toBeCloseTo(30);
    expect(uy * next.scale + next.ty).toBeCloseTo(-20);
  });

  it("スケールはクランプされる", () => {
    expect(zoomAt({ scale: 1, tx: 0, ty: 0 }, 0, 0, 99).scale).toBe(MAX_SCALE);
    expect(zoomAt({ scale: 2, tx: 0, ty: 0 }, 0, 0, 0.1).scale).toBe(MIN_SCALE);
  });

  it("ダブルタップ倍率は範囲内", () => {
    expect(DOUBLE_TAP_SCALE).toBeGreaterThan(MIN_SCALE);
    expect(DOUBLE_TAP_SCALE).toBeLessThanOrEqual(MAX_SCALE);
  });
});

describe("clampPan", () => {
  it("表示内容がビューより小さい軸は中央(0)に戻す", () => {
    const next = clampPan({ scale: 1, tx: 50, ty: -30 }, 400, 300, 800, 600);
    expect(next.tx).toBeCloseTo(0);
    expect(next.ty).toBeCloseTo(0);
  });

  it("はみ出している軸は端で止まる", () => {
    // 2倍で 800x600 → ビュー400x300。可動域は±(800-400)/2=±200、±(600-300)/2=±150
    const next = clampPan({ scale: 2, tx: 500, ty: -999 }, 400, 300, 400, 300);
    expect(next.tx).toBe(200);
    expect(next.ty).toBe(-150);
  });

  it("可動域内の値はそのまま", () => {
    const next = clampPan({ scale: 2, tx: -120, ty: 99 }, 400, 300, 400, 300);
    expect(next.tx).toBe(-120);
    expect(next.ty).toBe(99);
  });
});

describe("pinchScale", () => {
  it("指の距離の比率でスケールが変わる（クランプ付き）", () => {
    expect(pinchScale(1, 100, 200)).toBe(2);
    expect(pinchScale(2, 100, 50)).toBe(1);
    expect(pinchScale(2, 100, 500)).toBe(MAX_SCALE);
  });

  it("開始距離0でもゼロ除算しない", () => {
    expect(Number.isFinite(pinchScale(1, 0, 100))).toBe(true);
  });
});
