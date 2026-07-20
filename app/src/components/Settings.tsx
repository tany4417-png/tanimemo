import { useState } from "react";
import { BackIcon, ExportIcon, TrashIcon } from "./icons";

type Props = {
  syncBar: React.ReactNode;
  token: string;
  onSave: (t: string) => void;
  onBack: () => void;
  onExport: () => void;
  onTrash: () => void;
};

export function Settings({ syncBar, token, onSave, onBack, onExport, onTrash }: Props) {
  const [value, setValue] = useState(token);
  return (
    <div className="settings">
      <div className="list-header">
        {syncBar}
        <div className="toolbar">
          <button className="icon-btn" onClick={onBack} aria-label="戻る">
            <BackIcon />
          </button>
          <h2>設定</h2>
        </div>
      </div>
      <label htmlFor="token">APIトークン</label>
      <input id="token" type="password" value={value} onChange={(e) => setValue(e.target.value)} />
      <button className="primary" onClick={() => onSave(value.trim())}>保存</button>
      <hr />
      <button className="tint acc-teal" onClick={onExport}>
        <ExportIcon size={18} />
        全メモをエクスポート（zip）
      </button>
      <button onClick={onTrash}>
        <TrashIcon size={18} />
        ゴミ箱
      </button>
    </div>
  );
}
