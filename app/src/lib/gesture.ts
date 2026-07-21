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

// 背景（カードやボタンの上ではない何もないところ）での右フリック追従スワイプ（iOS風の戻るジェスチャー）を、
// 指を離した時点で「戻る操作として完了させる」か判定する。追従中は.screenが指に追従して動いており
// （App.tsxのonMainPointerMove）、この関数はpointerup時点の最終dxと速度だけから完了/スナップバックを決める。
// dx: pointerdownからの水平移動量（px、右が正）。vx: 速度（px/ms、pointerdownから指を離すまでの平均）。
// 90pxを超えて動いていれば速度に関わらず完了。50pxを超えていて素早い（vx>0.5）場合も完了。それ以外はスナップバック。
export function shouldCompleteBack(dx: number, vx: number): boolean {
  return dx > 90 || (dx > 50 && vx > 0.5);
}
