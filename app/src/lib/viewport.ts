// メモ画面の1行ヘッダーの高さ（px）。styles.cssの--note-header-hと同じ値を持つ。
// スクロールで隠す判定の「この深さまでは隠さない」しきい値にも使う
export const HEADER_H = 48;
// スクロール位置がこの範囲にある間はヘッダーを必ず出す
const TOP_ZONE = 8;
// 隠れているヘッダーを出すのに必要な、上方向のスクロール量
const SHOW_DELTA = 8;

export type ScrollHideState = {
  visible: boolean;
  lastTop: number;
};

// スクロール1回ぶんの位置からヘッダーを出すか隠すかを決める。
// 下へ動かしたら隠し、上へはっきり戻すか最上部に着いたら出す
export function scrollHideStep(state: ScrollHideState, top: number): ScrollHideState {
  if (top <= TOP_ZONE) return { visible: true, lastTop: top };
  const delta = top - state.lastTop;
  if (delta > 0 && top > HEADER_H) return { visible: false, lastTop: top };
  if (delta <= -SHOW_DELTA) return { visible: true, lastTop: top };
  return { visible: state.visible, lastTop: top };
}
