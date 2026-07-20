// SwipeableCard（NoteList.tsx）のジェスチャー判定。
// pointer座標の生の追跡はDOMイベント無しでは検証できないため、
// 判定式（数値→真偽値の写像）だけを純関数として切り出す。

// 削除スワイプの確定判定。
// dx: pointerdownからの水平移動量（px、左が負）
// vx: 直近のpointermove区間の水平速度（px/ms、左が負）
// 長い距離を動かした場合に加え、短距離でも速い左フリックなら確定とみなす。
export function shouldCommitSwipe(dx: number, vx: number): boolean {
  return dx < -110 || (dx < -60 && vx < -0.5);
}

// pointerup時にタップ（開く）とみなすかどうかの判定。
// moved: pointerdownからの累計最大移動量（√(dx²+dy²)の最大値、px）
// dragging: 削除スワイプ判定に入っていたか
// dragMode: 長押しドラッグ移動モードに入っていたか
// 10px以上動いた指離しは、スワイプにもドラッグにも至らない中途半端な操作として無視する。
export function isTap(moved: number, dragging: boolean, dragMode: boolean): boolean {
  return !dragging && !dragMode && moved < 10;
}
