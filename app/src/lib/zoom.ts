// 原寸表示のズーム計算（純関数）。座標はすべて「コンテナ中心を原点」としたpx。
// 描画側は img に transform: translate(tx, ty) scale(scale) を適用する前提
// （transform-originは中央、レイアウト上のimgサイズがscale=1の基準サイズ）

export type ZoomState = { scale: number; tx: number; ty: number };

export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
// ダブルタップで等倍⇔この倍率を切り替える
export const DOUBLE_TAP_SCALE = 2.5;

export function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

// 基準点(pcx,pcy)の直下にある画像上の点を動かさずにスケールだけ変える。
// 基準点直下の画像座標 u = (p - t) / s が、変換後も u*s' + t' = p を満たすよう t' を解く
export function zoomAt(state: ZoomState, pcx: number, pcy: number, nextScale: number): ZoomState {
  const s = clampScale(nextScale);
  const k = s / state.scale;
  return { scale: s, tx: pcx - (pcx - state.tx) * k, ty: pcy - (pcy - state.ty) * k };
}

// 表示内容がビューより小さい軸は中央へ、はみ出す軸は端（画像の縁がビューの縁に届く位置）で止める
export function clampPan(state: ZoomState, baseW: number, baseH: number, viewW: number, viewH: number): ZoomState {
  const mx = Math.max(0, (baseW * state.scale - viewW) / 2);
  const my = Math.max(0, (baseH * state.scale - viewH) / 2);
  return { ...state, tx: Math.min(mx, Math.max(-mx, state.tx)), ty: Math.min(my, Math.max(-my, state.ty)) };
}

// ピンチ開始時のスケールと指間距離を基準に、現在の指間距離からスケールを求める
export function pinchScale(startScale: number, startDist: number, dist: number): number {
  return clampScale(startScale * (dist / Math.max(1, startDist)));
}
