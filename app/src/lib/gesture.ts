// SwipeableCard（NoteList.tsx）のジェスチャー判定。
// pointer座標の生の追跡はDOMイベント無しでは検証できないため、
// 判定式（数値→真偽値の写像）だけを純関数として切り出す。

// スワイプを離したときに「削除ボタンを開いた状態にする」か判定する（iOSメモ帳方式の2段階削除）。
// dx: pointerdownからの水平移動量（px、左が負）。40pxを超えて左に動いていれば開いた状態にスナップする。
// 開いた状態からの右スワイプで閉じるかどうかの判定にも同じ関数を使う（falseなら閉じる）。
export function shouldOpenSwipe(dx: number): boolean {
  return dx < -40;
}

// pointerup時にタップ（ノートを開く/削除ボタンを閉じる）とみなすかどうかの判定。
// moved: pointerdownからの累計最大移動量（√(dx²+dy²)の最大値、px）
// dragging: 削除スワイプ判定に入っていたか
// dragMode: 長押しドラッグ移動モードに入っていたか
// 10px以上動いた指離しは、スワイプにもドラッグにも至らない中途半端な操作として無視する。
export function isTap(moved: number, dragging: boolean, dragMode: boolean): boolean {
  return !dragging && !dragMode && moved < 10;
}

// 背景（カードやボタンの上ではない何もないところ）での右フリックを「前の画面に戻る」操作とみなすかどうかの判定。
// iOS風の戻るジェスチャー。App.tsxのルート要素でpointerdown〜pointerupの座標・経過時間から呼ぶ。
// dx: 水平移動量（px、右が正）。dy: 垂直移動量（px）。elapsedMs: pointerdownからpointerupまでの経過時間（ms）。
// 60pxを超える右移動・横方向優勢（|dx| > 1.5×|dy|）・600ms以内の3条件をすべて満たしたときだけ戻る。
export function isBackFlick(dx: number, dy: number, elapsedMs: number): boolean {
  return dx > 60 && Math.abs(dx) > 1.5 * Math.abs(dy) && elapsedMs <= 600;
}
