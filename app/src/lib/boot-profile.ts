// 起動が遅いときの調査用プロファイル。起動のたびに区間を測り、最後の1回分だけlocalStorageへ残す。
// 設定画面の診断パネルから読めるので、iPhoneで開いて数字をそのままコピーできる。
// 常時動くコードなので、計測そのものが重くならないよう記録は配列2本に収める。

export type BootMark = { name: string; ms: number };
export type BootSpan = { name: string; ms: number };
export type BootProfile = {
  // 保存した時刻（epoch ms）。表示のときだけ使う
  at: number;
  // 起動開始からの経過
  marks: BootMark[];
  // 個別処理の所要
  spans: BootSpan[];
  counts: { notes: number; bodyChars: number };
};

const STORAGE_KEY = "tanimemo.bootProfile";

let clock: () => number = () => performance.now();
let bootAt = 0;
let marks: BootMark[] = [];
let spans: BootSpan[] = [];

// 起動の入口（main.tsx）で1回呼ぶ。テストでは時計を差し替える
export function startBootProfile(now: () => number = () => performance.now()): void {
  clock = now;
  bootAt = clock();
  marks = [];
  spans = [];
}

// 起動開始からの経過を記録する。同名は最初の1回だけ残す（StrictModeの二重実行で重複させないため）
export function markBoot(name: string): void {
  if (marks.some((m) => m.name === name)) return;
  marks.push({ name, ms: Math.round(clock() - bootAt) });
}

// 処理を包んで所要を記録する。戻り値と例外はそのまま呼び出し側へ通す
export async function measureBoot<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const started = clock();
  try {
    return await fn();
  } finally {
    spans.push({ name, ms: Math.round(clock() - started) });
  }
}

export function finishBootProfile(
  counts: { notes: number; bodyChars: number },
  at: number = Date.now(),
  storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage
): BootProfile {
  const profile: BootProfile = { at, marks: [...marks], spans: [...spans], counts };
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // 保存できなくても起動は続ける（プライベートブラウズ等）
  }
  return profile;
}

export function loadBootProfile(
  storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage
): BootProfile | null {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BootProfile;
  } catch {
    return null;
  }
}

// 桁区切り。toLocaleStringは環境で結果が変わるので自前で入れる
function comma(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatBootProfile(p: BootProfile): string {
  const when = new Date(p.at).toLocaleString("ja-JP");
  const head = `前回の起動 (${when}) メモ${p.counts.notes}件 / 本文${comma(p.counts.bodyChars)}字`;
  const lines = p.marks.map((m) => `  ${m.name}: ${m.ms}ms`);
  const detail = p.spans.length > 0 ? [`  内訳 ${p.spans.map((s) => `${s.name}: ${s.ms}ms`).join(" / ")}`] : [];
  return [head, ...lines, ...detail].join("\n");
}
