import type { Folder } from "../lib/types";

export function Breadcrumb({
  path,
  onNavigate,
  onRenameCurrent,
}: {
  path: Folder[];
  onNavigate: (id: string | null) => void;
  onRenameCurrent: () => void;
}) {
  const atRoot = path.length === 0;
  return (
    <div className="breadcrumb">
      {/* data-drop-folder: メモ・フォルダを上の階層へ戻すためのドロップ先。ルートは"root" */}
      <span className={atRoot ? "crumb crumb-current" : "crumb"} data-drop-folder="root" onClick={() => onNavigate(null)}>
        すべてのメモ
      </span>
      {path.map((f, i) => {
        const isCurrent = i === path.length - 1;
        return (
          <span key={f.id}>
            <span className="crumb-sep"> &gt; </span>
            <span
              className={isCurrent ? "crumb crumb-current" : "crumb"}
              data-drop-folder={f.id}
              onClick={() => (isCurrent ? onRenameCurrent() : onNavigate(f.id))}
            >
              {f.name}
            </span>
          </span>
        );
      })}
    </div>
  );
}
