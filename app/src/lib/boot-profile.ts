// 起動が遅いときの調査用プロファイル。起動のたびに区間を測り、最後の1回分だけlocalStorageへ残す。
// 設定画面の診断パネルから読めるので、iPhoneで開いて数字をそのままコピーできる。
// 常時動くコードなので、計測そのものが重くならないよう記録は配列2本に収める。

export type BootMark = { name: string; ms: number };
export type BootSpan = { name: string; ms: number };
// 画面が出るまでの内訳。ナビゲーション開始（アイコンをタップした直後）を0とした経過
export type BootNav = {
  // Service Workerが立ち上がってリクエストを処理し始めるまで
  workerStart: number;
  // HTMLを受け取り終えるまで
  responseEnd: number;
  domContentLoaded: number;
  // main.tsxのモジュールが動き始めるまで
  jsStart: number;
  // メインJSの取得所要と大きさ
  scriptMs: number;
  scriptKB: number;
  // SWが制御しているか（していなければキャッシュを使えていない）
  controlled: boolean;
};

export type BootProfile = {
  // 保存した時刻（epoch ms）。表示のときだけ使う
  at: number;
  // 起動開始からの経過
  marks: BootMark[];
  // 個別処理の所要
  spans: BootSpan[];
  counts: { notes: number; bodyChars: number };
  nav?: BootNav | null;
};

const STORAGE_KEY = "tanimemo.bootProfile";

// Performance APIのエントリを表示用にまとめる。取得元と丸め方をここに閉じ込めて単体テストする
export function summarizeNavigation(
  nav: { workerStart: number; responseEnd: number; domContentLoadedEventEnd: number } | undefined,
  script: { duration: number; transferSize: number; encodedBodySize: number } | undefined,
  jsStart: number,
  controlled: boolean
): BootNav | null {
  if (!nav) return null;
  // SWのキャッシュから返るとtransferSizeは0になる。実体サイズで代用する
  const bytes = script ? (script.transferSize > 0 ? script.transferSize : script.encodedBodySize) : 0;
  return {
    workerStart: Math.round(nav.workerStart),
    responseEnd: Math.round(nav.responseEnd),
    domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
    jsStart: Math.round(jsStart),
    scriptMs: script ? Math.round(script.duration) : 0,
    scriptKB: Math.round(bytes / 1024),
    controlled,
  };
}

// 実際のPerformance APIから拾う薄い層。メインJSはViteの出力名（/assets/index-*.js）で見分ける
function collectNavigation(jsStart: number): BootNav | null {
  if (typeof performance === "undefined") return null;
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  const script = performance
    .getEntriesByType("resource")
    .find((r) => r.name.includes("/assets/index-") && r.name.endsWith(".js")) as PerformanceResourceTiming | undefined;
  const controlled = typeof navigator !== "undefined" && navigator.serviceWorker?.controller != null;
  return summarizeNavigation(nav, script, jsStart, controlled);
}

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
  const profile: BootProfile = { at, marks: [...marks], spans: [...spans], counts, nav: collectNavigation(bootAt) };
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
  const n = p.nav;
  const navLines = n
    ? [
        `  画面が出るまで SW起動: ${n.workerStart}ms / HTML: ${n.responseEnd}ms / DOM: ${n.domContentLoaded}ms / JS開始: ${n.jsStart}ms`,
        `  メインJS: ${n.scriptMs}ms・${n.scriptKB}KB / SW制御: ${n.controlled ? "あり" : "なし"}`,
      ]
    : [];
  const lines = p.marks.map((m) => `  ${m.name}: ${m.ms}ms`);
  const detail = p.spans.length > 0 ? [`  内訳 ${p.spans.map((s) => `${s.name}: ${s.ms}ms`).join(" / ")}`] : [];
  return [head, ...navLines, ...lines, ...detail].join("\n");
}
