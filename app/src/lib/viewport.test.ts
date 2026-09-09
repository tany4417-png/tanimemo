import { describe, it, expect } from "vitest";
import { scrollHideStep, HEADER_H } from "./viewport";

describe("scrollHideStep", () => {
  const shown = { visible: true, lastTop: 0 };

  it("最上部にいる間はヘッダーを出したままにする", () => {
    expect(scrollHideStep(shown, 0)).toEqual({ visible: true, lastTop: 0 });
  });

  it("ヘッダーの高さを越えて下へスクロールしたら隠す", () => {
    expect(scrollHideStep(shown, HEADER_H + 20).visible).toBe(false);
  });

  it("ヘッダーの高さ以内の下スクロールではまだ隠さない", () => {
    expect(scrollHideStep(shown, HEADER_H - 10).visible).toBe(true);
  });

  it("隠れているとき、上へ少し戻すだけでは出さない", () => {
    const hidden = { visible: false, lastTop: 500 };
    expect(scrollHideStep(hidden, 496).visible).toBe(false);
  });

  it("隠れているとき、上へはっきり戻したら出す", () => {
    const hidden = { visible: false, lastTop: 500 };
    expect(scrollHideStep(hidden, 480).visible).toBe(true);
  });

  it("隠れたまま最上部まで戻ったら出す", () => {
    const hidden = { visible: false, lastTop: 500 };
    expect(scrollHideStep(hidden, 0)).toEqual({ visible: true, lastTop: 0 });
  });

  it("スクロール位置は毎回持ち越す", () => {
    expect(scrollHideStep(shown, 300).lastTop).toBe(300);
  });

  it("負のスクロール位置（ラバーバンド）でも出したままにする", () => {
    const hidden = { visible: false, lastTop: 500 };
    expect(scrollHideStep(hidden, -30).visible).toBe(true);
  });
});
