// ドラッグ＆ドロップ（メモ・フォルダの移動）のドロップ先解決。
// data-drop-folder 属性値の文字列変換部分だけを純関数として切り出す。
// DOM要素そのもの（Element）はjsdom無しでは検証できないため、resolveDropTargetはテスト対象外（ブリーフ参照）。
export function parseDropFolder(value: string | null): string | null | "none" {
  if (value === null) return "none";
  return value === "root" ? null : value;
}

// pointermove/pointerup時にelementFromPointで得た要素から、data-drop-folder属性を持つ祖先を探して解決する。
export function resolveDropTarget(el: Element | null): string | null | "none" {
  const target = el?.closest("[data-drop-folder]") ?? null;
  return parseDropFolder(target?.getAttribute("data-drop-folder") ?? null);
}
