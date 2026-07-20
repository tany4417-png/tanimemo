// アクセント8色のWCAGコントラスト比検証。
// 「deep文字 on tint背景」「白文字 on deep背景」の両方が4.5:1以上かを確認する。
// 1組でも4.5未満ならexit 1（CIやコミット前チェックで使う想定）。

const WHITE = "#FFFFFF";

// styles.cssの:root（--c-*/--t-*）と値を揃えること。ここを唯一の真実源にはせず、
// styles.css側を直した後に手でこの表も合わせて実行し直す運用。
const PALETTE = [
  { name: "red", deep: "#9E312C", tint: "#F7E4E2" },
  { name: "orange", deep: "#8F4E12", tint: "#F8EBDD" },
  { name: "amber", deep: "#7A5C00", tint: "#F6EFD8" },
  { name: "green", deep: "#3D6B2E", tint: "#E7F0E0" },
  { name: "teal", deep: "#1F6B5E", tint: "#DFF0EC" },
  { name: "blue", deep: "#2B5F8A", tint: "#E1EBF2" },
  { name: "violet", deep: "#5C4790", tint: "#EAE5F4" },
  { name: "pink", deep: "#96376B", tint: "#F7E2EC" },
];

const MIN_RATIO = 4.5;

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`invalid hex color: ${hex}`);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

// sRGB→線形RGBのガンマ補正（WCAG 2.x の定義どおり）
function srgbToLinear(c) {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hexA, hexB) {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

const rows = [];
let hasFailure = false;

for (const { name, deep, tint } of PALETTE) {
  const tintRatio = contrastRatio(deep, tint);
  const whiteRatio = contrastRatio(WHITE, deep);
  const tintOk = tintRatio >= MIN_RATIO;
  const whiteOk = whiteRatio >= MIN_RATIO;
  if (!tintOk || !whiteOk) hasFailure = true;
  rows.push({ name, deep, tint, tintRatio, whiteRatio, tintOk, whiteOk });
}

function fmt(n) {
  return n.toFixed(2).padStart(5, " ");
}

const header = "色       deep     tint     deep on tint      白 on deep";
console.log(header);
console.log("-".repeat(header.length));
for (const r of rows) {
  const tintMark = r.tintOk ? "OK" : "NG";
  const whiteMark = r.whiteOk ? "OK" : "NG";
  console.log(
    `${r.name.padEnd(8)} ${r.deep}  ${r.tint}  ${fmt(r.tintRatio)}:1 ${tintMark}     ${fmt(r.whiteRatio)}:1 ${whiteMark}`
  );
}
console.log("-".repeat(header.length));
console.log(`基準: ${MIN_RATIO}:1 以上（WCAG AA・通常テキスト）`);

if (hasFailure) {
  console.error("\n結果: NG — 4.5:1未満の組み合わせがあります。");
  process.exit(1);
} else {
  console.log("\n結果: OK — 全16組み合わせが4.5:1以上です。");
  process.exit(0);
}
