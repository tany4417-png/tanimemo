// インラインSVGアイコン群（stroke 1.5px・currentColor・viewBox 24）。
// ボタン内の絵文字・テキスト矢印を置き換えるための小さな関数コンポーネント。
// 装飾用のためaria-hidden。文言はボタン側のaria-label/可視テキストで補う。
type IconProps = { size?: number; className?: string };

const common = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

// 同期（円形矢印）
export function SyncIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...common}>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

// 設定（歯車）
export function SettingsIcon({ size = 24, className }: IconProps) {
  const teeth = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <svg width={size} height={size} className={className} {...common}>
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="7.5" />
      {teeth.map((deg) => (
        <line key={deg} x1="12" y1="2.5" x2="12" y2="4.5" transform={`rotate(${deg} 12 12)`} />
      ))}
    </svg>
  );
}

// 戻る（←）
export function BackIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...common}>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

// フォルダ
export function FolderIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...common}>
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l1.5 2H19.5A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19H4.5A1.5 1.5 0 0 1 3 17.5z" />
    </svg>
  );
}

// ゴミ箱
export function TrashIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...common}>
      <polyline points="4 7 20 7" />
      <path d="M6 7v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
      <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

// 画像添付（山と丸の写真アイコン）
export function ImageIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...common}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

// エクスポート（下矢印＋受け皿）
export function ExportIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...common}>
      <path d="M12 3v11" />
      <polyline points="7 10 12 15 17 10" />
      <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

// 取り消し（左曲がり矢印）
export function UndoIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...common}>
      <polyline points="9 7 4 12 9 17" />
      <path d="M4 12h11a5 5 0 0 1 0 10h-1" />
    </svg>
  );
}

// やり直し（右曲がり矢印）
export function RedoIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...common}>
      <polyline points="15 7 20 12 15 17" />
      <path d="M20 12H9a5 5 0 0 0 0 10h1" />
    </svg>
  );
}
